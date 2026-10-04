import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import { authenticate, authenticateAllowingPasswordChange, authorizeAdmin } from '../middleware/authenticate.js';
import { tenantScope, withTenantClient, checkTenantAccess } from '../middleware/tenantScope.js';
import { resolveTenantFromHost } from '../middleware/resolveTenantFromHost.js';
import logger from '../logger.js';
import { validate } from '../middleware/validate.js';
import { loginSchema, createUserSchema, changePasswordSchema, resetPasswordSchema } from '../schemas/authSchema.js';
import { idParamsSchema } from '../schemas/common.js';
import { logAudit } from '../utils/auditLogger.js';

const router = express.Router();

// Limiti del rinnovo sessione:
// - un token si può rinnovare solo se è scaduto da meno di REFRESH_GRACE_MS;
// - la sessione dura al massimo MAX_SESSION_MS dal login, poi serve un nuovo login.
const REFRESH_GRACE_MS = 24 * 60 * 60 * 1000;
const MAX_SESSION_MS = 7 * 24 * 60 * 60 * 1000;

// `loginAt` (secondi, come iat/exp) è l'istante del login: il refresh lo conserva,
// così la durata massima della sessione non si allunga a ogni rinnovo.
// Il token dura TOKEN_TTL_S, ma mai oltre la fine della sessione massima.
const TOKEN_TTL_S = 8 * 60 * 60;
const signToken = (user, loginAt = Math.floor(Date.now() / 1000)) => {
  const sessionEndS = loginAt + MAX_SESSION_MS / 1000;
  const expiresIn = Math.max(1, Math.min(TOKEN_TTL_S, sessionEndS - Math.floor(Date.now() / 1000)));
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role, theme: user.theme || 'dark', tenantId: user.tenant_id, tenantName: user.tenant_name, mustChangePassword: !!user.must_change_password, loginAt },
    process.env.JWT_SECRET,
    { expiresIn }
  );
};

const setCookie = (res, token) => res.cookie('token', token, {
  httpOnly: true,
  secure: true,
  sameSite: 'none',
  path: '/',
  maxAge: TOKEN_TTL_S * 1000,
});

const clearCookie = (res) => res.cookie('token', '', {
  httpOnly: true,
  secure: true,
  sameSite: 'none',
  path: '/',
  expires: new Date(0),
});

// LOGIN
router.post('/login', validate({ body: loginSchema }), resolveTenantFromHost, async (req, res) => {
  const { username, password } = req.body;
  try {
    // L'utente si cerca solo nel tenant del sottodominio (RLS comprese): l'username è unico per tenant.
    // Un utente di un altro tenant non si distingue da uno inesistente.
    const user = await withTenantClient(req.tenantId, async (db) => {
      const { rows } = await db.query('SELECT * FROM users WHERE username = $1', [username]);
      return rows[0] || null;
    });
    if (!user) return res.status(401).json({ error: 'Utente non trovato' });

    const { rows: tenantRows } = await pool.query('SELECT expires_at, active, name FROM tenants WHERE id = $1', [user.tenant_id]);
    const tenant = tenantRows[0];

    if (!tenant?.active) {
      return res.status(403).json({ error: 'Account disattivato. Contatta l\'assistenza.', code: 'TENANT_INACTIVE' });
    }
    if (tenant.expires_at && new Date(tenant.expires_at) < new Date()) {
      return res.status(402).json({ error: "Licenza scaduta. Contatta l'assistenza per rinnovarla.", code: 'LICENSE_EXPIRED' });
    }

    user.tenant_name = tenant.name;
    // Un utente senza password (creato prima della 021) non può entrare: un admin deve reimpostarla.
    // Stesso messaggio di una password errata, così non si capisce che l'account esiste.
    if (!user.password_hash?.trim() || !await bcrypt.compare(password, user.password_hash))
      return res.status(401).json({ error: 'Password errata' });

    setCookie(res, signToken(user));

    res.json({ id: user.id, username: user.username, role: user.role, needsPassword: user.must_change_password, theme: user.theme || 'dark', tenantName: user.tenant_name });
    } catch (err) {
    logger.error({ err }, 'Errore server')
    res.status(500).json({ error: 'Errore server' });
  }
});

// REFRESH TOKEN
// Accetta anche un token appena scaduto (il frontend può arrivare in ritardo,
// es. tablet in standby), ma solo entro REFRESH_GRACE_MS e MAX_SESSION_MS.
router.post('/refresh', async (req, res) => {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ error: 'Token mancante' });

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET, { ignoreExpiration: true });
  } catch (err) {
    logger.warn({ err }, 'Tentativo di refresh con token corrotto o alterato');
    return res.status(401).json({ error: 'Token non valido' });
  }

  const now = Date.now();
  // I token emessi prima di questa modifica non hanno loginAt: si parte da iat.
  const loginAt = decoded.loginAt ?? decoded.iat;
  if (decoded.exp * 1000 + REFRESH_GRACE_MS < now || loginAt * 1000 + MAX_SESSION_MS < now) {
    clearCookie(res);
    return res.status(401).json({ error: 'Sessione scaduta, effettua di nuovo il login', code: 'SESSION_EXPIRED' });
  }

  try {
    const denied = await checkTenantAccess(decoded.tenantId);
    if (denied) {
      clearCookie(res);
      return res.status(denied.status).json({ error: denied.error, code: denied.code });
    }

    // L'utente esiste ancora? (potrebbe essere stato eliminato nel frattempo)
    const user = await withTenantClient(decoded.tenantId, async (db) => {
      const { rows } = await db.query('SELECT id, username, role, tenant_id, must_change_password FROM users WHERE id = $1', [decoded.id]);
      return rows[0] || null;
    });
    if (!user) {
      clearCookie(res);
      return res.status(401).json({ error: 'Utente non trovato o disabilitato' });
    }

    const { rows: tRows } = await pool.query('SELECT name FROM tenants WHERE id = $1', [decoded.tenantId]);
    user.tenant_name = tRows[0]?.name;

    setCookie(res, signToken(user, loginAt));
    logger.info({ userId: user.id, tenantId: user.tenant_id }, 'Sessione rinnovata');
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, 'Errore durante il refresh del token');
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

// CHANGE PASSWORD
// Una password attuale errata è un dato non valido (400), non una sessione scaduta (401):
// il frontend su 401 tenterebbe di rinnovare la sessione.
router.post('/change-password', authenticateAllowingPasswordChange, validate({ body: changePasswordSchema }), tenantScope, async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  try {
    const { rows } = await req.db.query('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'Utente non trovato' });

    const currentHash = rows[0].password_hash;
    if (!currentHash || !await bcrypt.compare(oldPassword, currentHash))
      return res.status(400).json({ error: 'Password attuale errata' });
    if (oldPassword === newPassword)
      return res.status(400).json({ error: 'La nuova password deve essere diversa da quella attuale' });

    await req.db.query('UPDATE users SET password_hash=$1, must_change_password=false WHERE id=$2', [await bcrypt.hash(newPassword, 10), req.user.id]);
    await logAudit(req.db, req.user.id, 'CHANGE_PASSWORD', {});

    // Il token portava il blocco del primo accesso: se ne emette uno nuovo senza, mantenendo l'inizio sessione.
    const { loginAt } = jwt.decode(req.cookies?.token ?? '') || {};
    setCookie(res, signToken({ ...req.user, tenant_id: req.user.tenantId, tenant_name: req.user.tenantName }, loginAt));

    res.json({ message: 'Password aggiornata con successo' });
  } catch (err) {
    logger.error({ err }, 'Errore cambio password');
    res.status(500).json({ error: 'Errore durante il cambio password' });
  }
});

// CREATE USER (admin only)
router.post('/admin/createUser', authenticate, authorizeAdmin, validate({ body: createUserSchema }), tenantScope, async (req, res) => {
  const { username, role, password } = req.body;
  try {
    const { rows } = await req.db.query(
      'INSERT INTO users (username, role, tenant_id, password_hash, must_change_password) VALUES ($1, $2, $3, $4, true) RETURNING id, username, role',
      [username, role, req.user.tenantId, await bcrypt.hash(password, 10)]
    );
    await logAudit(req.db, req.user.id, 'CREATE_USER', { userId: rows[0].id, role });

    res.status(201).json({ message: 'Utente creato con successo', user: rows[0] });
  } catch (err) {
    if (err.code === '23505') // username già usato in questo tenant
      return res.status(409).json({ error: 'Username già esistente' });
    logger.error({ err }, 'Errore createUser');
    res.status(500).json({ error: 'Errore server' });
  }
});

// RESET PASSWORD (admin only): password temporanea per un utente del proprio tenant, da cambiare al primo accesso.
// Serve anche a sbloccare gli account rimasti senza password.
router.post('/admin/users/:id/reset-password', authenticate, authorizeAdmin, validate({ params: idParamsSchema, body: resetPasswordSchema }), tenantScope, async (req, res) => {
  try {
    const { rows } = await req.db.query(
      'UPDATE users SET password_hash=$1, must_change_password=true WHERE id=$2 RETURNING id, username',
      [await bcrypt.hash(req.body.password, 10), req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Utente non trovato' });
    await logAudit(req.db, req.user.id, 'RESET_PASSWORD', { userId: rows[0].id });
    res.json({ message: 'Password reimpostata: andrà cambiata al primo accesso' });
  } catch (err) {
    logger.error({ err }, 'Errore reset password');
    res.status(500).json({ error: 'Errore server' });
  }
});

// ME
router.get('/me', authenticateAllowingPasswordChange, (req, res) => {
  res.json({
    id: req.user.id,
    username: req.user.username,
    role: req.user.role,
    theme: 'dark', // legacy: il tema è solo stato del client
    tenantName: req.user.tenantName,
    needsPassword: req.user.mustChangePassword,
  });
});

// LOGOUT
router.post('/logout', (req, res) => {
  clearCookie(res);
  res.json({ message: 'Bye' });
});

export default router;