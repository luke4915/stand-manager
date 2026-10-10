import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import { authenticate, authenticateAllowingPasswordChange, authorizeAdmin } from '../middleware/authenticate.js';
import { tenantScope, withTenantClient, checkTenantAccess } from '../middleware/tenantScope.js';
import { resolveTenantFromHost } from '../middleware/resolveTenantFromHost.js';
import logger from '../logger.js';
import { VERIFY_OPTIONS } from '../utils/jwtConfig.js';
import { REFRESH_GRACE_MS, MAX_SESSION_MS, signToken, setCookie, clearCookie } from '../utils/sessionToken.js';
import { validate } from '../middleware/validate.js';
import { loginSchema, createUserSchema, changePasswordSchema, resetPasswordSchema, updateUserSchema } from '../schemas/authSchema.js';
import { idParamsSchema } from '../schemas/common.js';
import { logAudit } from '../utils/auditLogger.js';
import { hashPassword, DUMMY_HASH } from '../utils/password.js';
import { sendHttpError } from '../utils/httpError.js';
import { invalidateUserStatus } from '../utils/userStatus.js';
import { getTenantModules } from '../utils/tenantModules.js';
import { createUser, listUsers, updateUser, deleteUser, resetUserPassword } from '../utils/tenantUsers.js';

const INVALID_CREDENTIALS = 'Credenziali non valide';

const router = express.Router();

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
    // Utente inesistente, senza password o password errata: stessa risposta e stesso tempo
    // (bcrypt gira comunque), così non si capisce quali username esistono.
    const hash = user?.password_hash?.trim() ? user.password_hash : DUMMY_HASH;
    const valid = await bcrypt.compare(password, hash);
    if (!user || hash === DUMMY_HASH || !valid)
      return res.status(401).json({ error: INVALID_CREDENTIALS });

    // Stato del tenant solo dopo la password: chi non ha le credenziali non lo scopre.
    const { rows: tenantRows } = await pool.query('SELECT expires_at, active, name, business_type, modules FROM tenants WHERE id = $1', [user.tenant_id]);
    const tenant = tenantRows[0];

    if (!tenant?.active) {
      return res.status(403).json({ error: 'Account disattivato. Contatta l\'assistenza.', code: 'TENANT_INACTIVE' });
    }
    if (tenant.expires_at && new Date(tenant.expires_at) < new Date()) {
      return res.status(402).json({ error: "Licenza scaduta. Contatta l'assistenza per rinnovarla.", code: 'LICENSE_EXPIRED' });
    }

    user.tenant_name = tenant.name;
    setCookie(res, signToken(user));

    res.json({ id: user.id, username: user.username, role: user.role, needsPassword: user.must_change_password, theme: user.theme || 'dark', tenantName: user.tenant_name, businessType: tenant.business_type, modules: tenant.modules });
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
    decoded = jwt.verify(token, process.env.JWT_SECRET, { ...VERIFY_OPTIONS, ignoreExpiration: true });
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

    await req.db.query('UPDATE users SET password_hash=$1, must_change_password=false WHERE id=$2', [await hashPassword(newPassword), req.user.id]);
    invalidateUserStatus(req.user.tenantId, req.user.id);
    await logAudit(req.db, req.user.id, 'CHANGE_PASSWORD', {});

    // Il token portava il blocco del primo accesso: se ne emette uno nuovo senza, mantenendo l'inizio sessione.
    setCookie(res, signToken({ ...req.user, tenant_id: req.user.tenantId, tenant_name: req.user.tenantName }, req.user.loginAt));

    res.json({ message: 'Password aggiornata con successo' });
  } catch (err) {
    logger.error({ err }, 'Errore cambio password');
    res.status(500).json({ error: 'Errore durante il cambio password' });
  }
});

// CREATE USER (admin only)
router.post('/admin/createUser', authenticate, authorizeAdmin, validate({ body: createUserSchema }), tenantScope, async (req, res) => {
  try {
    const user = await createUser(req.db, req.user.tenantId, req.body);
    await logAudit(req.db, req.user.id, 'CREATE_USER', { userId: user.id, role: user.role });
    res.status(201).json({ message: 'Utente creato con successo', user });
  } catch (err) {
    if (sendHttpError(res, err)) return;
    logger.error({ err }, 'Errore createUser');
    res.status(500).json({ error: 'Errore server' });
  }
});

// ELENCO UTENTI del proprio tenant (admin only)
router.get('/admin/users', authenticate, authorizeAdmin, tenantScope, async (req, res) => {
  try {
    res.json(await listUsers(req.db));
  } catch (err) {
    logger.error({ err }, 'Errore elenco utenti');
    res.status(500).json({ error: 'Errore caricamento utenti' });
  }
});

// MODIFICA RUOLO/USERNAME (admin only). Non si cambia il ruolo di se stessi: si resterebbe senza accesso al pannello.
router.patch('/admin/users/:id', authenticate, authorizeAdmin, validate({ params: idParamsSchema, body: updateUserSchema }), tenantScope, async (req, res) => {
  const { id } = req.params;
  if (id === req.user.id && req.body.role && req.body.role !== req.user.role)
    return res.status(409).json({ error: 'Non puoi cambiare il tuo ruolo', code: 'SELF_ROLE_CHANGE' });
  try {
    const { previous, ...user } = await updateUser(req.db, req.user.tenantId, id, req.body);
    await logAudit(req.db, req.user.id, 'UPDATE_USER', { userId: id, previous, role: user.role, username: user.username });
    // Chi rinomina se stesso riceve un token col nome nuovo (come da /profile/username).
    if (id === req.user.id)
      setCookie(res, signToken({ ...req.user, username: user.username, tenant_id: req.user.tenantId, tenant_name: req.user.tenantName }, req.user.loginAt));
    res.json(user);
  } catch (err) {
    if (sendHttpError(res, err)) return;
    logger.error({ err }, 'Errore modifica utente');
    res.status(500).json({ error: 'Errore server' });
  }
});

// ELIMINA UTENTE (admin only). Non si elimina se stessi.
router.delete('/admin/users/:id', authenticate, authorizeAdmin, validate({ params: idParamsSchema }), tenantScope, async (req, res) => {
  const { id } = req.params;
  if (id === req.user.id)
    return res.status(409).json({ error: 'Non puoi eliminare il tuo utente', code: 'SELF_DELETE' });
  try {
    const user = await deleteUser(req.db, req.user.tenantId, id);
    await logAudit(req.db, req.user.id, 'DELETE_USER', { userId: id, username: user.username, role: user.role });
    res.json({ ok: true });
  } catch (err) {
    if (sendHttpError(res, err)) return;
    logger.error({ err }, 'Errore eliminazione utente');
    res.status(500).json({ error: 'Errore server' });
  }
});

// RESET PASSWORD (admin only): password temporanea per un utente del proprio tenant, da cambiare al primo accesso.
// Serve anche a sbloccare gli account rimasti senza password.
router.post('/admin/users/:id/reset-password', authenticate, authorizeAdmin, validate({ params: idParamsSchema, body: resetPasswordSchema }), tenantScope, async (req, res) => {
  try {
    const user = await resetUserPassword(req.db, req.user.tenantId, req.params.id, req.body.password);
    await logAudit(req.db, req.user.id, 'RESET_PASSWORD', { userId: user.id });
    res.json({ message: 'Password reimpostata: andrà cambiata al primo accesso' });
  } catch (err) {
    if (sendHttpError(res, err)) return;
    logger.error({ err }, 'Errore reset password');
    res.status(500).json({ error: 'Errore server' });
  }
});

// ME
router.get('/me', authenticateAllowingPasswordChange, async (req, res) => {
  try {
    const tenant = await getTenantModules(req.user.tenantId);
    res.json({
      id: req.user.id,
      username: req.user.username,
      role: req.user.role,
      theme: 'dark', // legacy: il tema è solo stato del client
      tenantName: req.user.tenantName,
      businessType: tenant?.businessType,
      modules: tenant?.modules ?? [],
      needsPassword: req.user.mustChangePassword,
    });
  } catch (err) {
    logger.error({ err }, 'Errore /auth/me');
    res.status(500).json({ error: 'Errore server' });
  }
});

// LOGOUT
router.post('/logout', (req, res) => {
  clearCookie(res);
  res.json({ message: 'Bye' });
});

export default router;