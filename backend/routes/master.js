import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { masterPool, inTransaction } from '../db.js';
import { withTenantClient } from '../middleware/tenantScope.js';
import { authenticateMaster } from '../middleware/authenticateMaster.js';
import logger from '../logger.js';
import { SIGN_OPTIONS } from '../utils/jwtConfig.js';
import { hashPassword } from '../utils/password.js';
import { validate } from '../middleware/validate.js';
import { idParamsSchema } from '../schemas/common.js';
import { masterLoginSchema, createTenantSchema, extendLicenseSchema, tenantActiveSchema, deleteTenantSchema, receiptCustomizationSchema, tenantUserParamsSchema, tenantModulesSchema } from '../schemas/masterSchema.js';
import { createUserSchema, resetPasswordSchema, updateUserSchema } from '../schemas/authSchema.js';
import { catalog, normalizeModules, firstModuleNotAllowed, BUSINESS_TYPES } from '../utils/modules.js';
import { invalidateTenantModules } from '../utils/tenantModules.js';
import { logAudit } from '../utils/auditLogger.js';
import { sendHttpError } from '../utils/httpError.js';
import { createUser, listUsers, updateUser, deleteUser, resetUserPassword } from '../utils/tenantUsers.js';
import { RECEIPT_SETTINGS_KEYS } from '../schemas/settingsSchema.js';

const router = express.Router();

const setMasterCookie = (res, token) => res.cookie('master_token', token, {
  httpOnly: true,
  secure: true,
  sameSite: 'strict', // più restrittivo del cookie tenant: nessun uso cross-site previsto
  path: '/',
  maxAge: 1000 * 60 * 60 * 4, // 4h, sessione corta per un pannello sensibile
});

// LOGIN — password singola (solo tu), hash in env, mai in chiaro nel codice
router.post('/login', validate({ body: masterLoginSchema }), async (req, res) => {
  const { password } = req.body;
  if (!process.env.MASTER_PASSWORD_HASH || !process.env.MASTER_JWT_SECRET) {
    return res.status(500).json({ error: 'Pannello master non configurato' });
  }
  const valid = await bcrypt.compare(password, process.env.MASTER_PASSWORD_HASH);
  if (!valid) return res.status(401).json({ error: 'Password errata' });

  const token = jwt.sign({ master: true }, process.env.MASTER_JWT_SECRET, { ...SIGN_OPTIONS, expiresIn: '4h' });
  setMasterCookie(res, token);
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  res.cookie('master_token', '', { httpOnly: true, secure: true, sameSite: 'strict', path: '/', expires: new Date(0) });
  res.json({ ok: true });
});

// CATALOGO — moduli e tipi di attività disponibili (unica fonte: utils/modules.js)
router.get('/catalog', authenticateMaster, (req, res) => res.json(catalog()));

// LISTA TENANT — tabella tenants non ha RLS, query diretta legittima
router.get('/tenants', authenticateMaster, async (req, res) => {
  try {
    const { rows } = await masterPool.query(
      `SELECT t.*, COUNT(u.id) AS user_count
       FROM tenants t LEFT JOIN users u ON u.tenant_id = t.id
       GROUP BY t.id ORDER BY t.created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    logger.error({ err }, 'Errore GET /api/master/tenants');
    res.status(500).json({ error: 'Errore caricamento tenant' });
  }
});

// CREA TENANT + primo utente admin
router.post('/tenants', authenticateMaster, validate({ body: createTenantSchema }), async (req, res) => {
  const { slug, name, plan, expiresInDays, adminUsername, adminPassword, businessType } = req.body;
  const modules = normalizeModules(req.body.modules ?? BUSINESS_TYPES[businessType].modules);

  const client = await masterPool.connect();
  try {
    await client.query('BEGIN');

    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

    const { rows: tenantRows } = await client.query(
      `INSERT INTO tenants (slug, name, plan, expires_at, business_type, modules) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [slug, name, plan, expiresAt, businessType, modules]
    );
    const tenant = tenantRows[0];

    // L'INSERT su users è soggetto a RLS (WITH CHECK): serve il contesto del
    // nuovo tenant sulla connessione, non basta essere dentro la transazione.
    await client.query('SELECT set_config($1, $2, false)', ['app.tenant_id', String(tenant.id)]);
    const { rows: userRows } = await client.query(
      `INSERT INTO users (username, role, tenant_id, password_hash, must_change_password) VALUES ($1, 'admin', $2, $3, true) RETURNING id, username, role`,
      [adminUsername, tenant.id, await hashPassword(adminPassword)]
    );

    await client.query('COMMIT');
    res.status(201).json({ tenant, admin: userRows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505')
      return res.status(409).json({ error: 'Slug già esistente' });
    logger.error({ err }, 'Errore creazione tenant');
    res.status(500).json({ error: 'Errore creazione tenant' });
  } finally {
    client.release();
  }
});

// ESTENDI LICENZA — aggiunge N giorni partendo da oggi o dalla scadenza attuale, quella più lontana
router.patch('/tenants/:id/extend', authenticateMaster, validate({ params: idParamsSchema, body: extendLicenseSchema }), async (req, res) => {
  const { days } = req.body;
  try {
    const { rows } = await masterPool.query(
      `UPDATE tenants SET expires_at = GREATEST(COALESCE(expires_at, now()), now()) + ($1 || ' days')::interval
       WHERE id = $2 RETURNING *`,
      [days, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Tenant non trovato' });
    res.json(rows[0]);
  } catch (err) {
    logger.error({ err }, 'Errore estensione licenza');
    res.status(500).json({ error: 'Errore estensione licenza' });
  }
});

// MODULI — sostituisce l'insieme; vale subito (cache invalidata) sul processo che lo riceve.
// Il tipo di attività è fisso: i moduli devono esistere per quel tipo (una sagra non ha i tavoli, un ristorante non ha il menu QR).
router.put('/tenants/:id/modules', authenticateMaster, validate({ params: idParamsSchema, body: tenantModulesSchema }), async (req, res) => {
  try {
    const { rows: current } = await masterPool.query('SELECT business_type FROM tenants WHERE id = $1', [req.params.id]);
    if (!current.length) return res.status(404).json({ error: 'Tenant non trovato' });
    const notAllowed = firstModuleNotAllowed(current[0].business_type, req.body.modules);
    if (notAllowed) return res.status(400).json({ error: `modules: il modulo "${notAllowed}" non esiste per questo tipo di attività` });

    const { rows } = await masterPool.query(
      'UPDATE tenants SET modules = $1 WHERE id = $2 RETURNING *',
      [normalizeModules(req.body.modules), req.params.id]
    );
    invalidateTenantModules(req.params.id);
    logger.info({ tenantId: req.params.id, businessType: rows[0].business_type, modules: rows[0].modules }, 'Moduli del tenant aggiornati dal master');
    res.json(rows[0]);
  } catch (err) {
    logger.error({ err }, 'Errore PUT /api/master/tenants/:id/modules');
    res.status(500).json({ error: 'Errore salvataggio moduli' });
  }
});

// ATTIVA/DISATTIVA — reversibile, non tocca i dati
router.patch('/tenants/:id/active', authenticateMaster, validate({ params: idParamsSchema, body: tenantActiveSchema }), async (req, res) => {
  try {
    const { rows } = await masterPool.query(
      'UPDATE tenants SET active = $1 WHERE id = $2 RETURNING *',
      [req.body.active, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Tenant non trovato' });
    res.json(rows[0]);
  } catch (err) {
    logger.error({ err }, 'Errore attivazione/disattivazione tenant');
    res.status(500).json({ error: 'Errore attivazione/disattivazione tenant' });
  }
});

// PERSONALIZZAZIONE SCONTRINI — testi e immagini delle copie di un tenant (solo master).
// Le tabelle del tenant si toccano solo con la sua connessione scoped (withTenantClient), mai con masterPool.query.
// `masterPool` è il pool del ruolo master (vedi db.js e migrazione 025), non quello applicativo.
async function tenantExists(id) {
  const { rows } = await masterPool.query('SELECT 1 FROM tenants WHERE id = $1', [id]);
  return rows.length > 0;
}

router.get('/tenants/:id/receipt', authenticateMaster, validate({ params: idParamsSchema }), async (req, res) => {
  const { id } = req.params;
  try {
    if (!await tenantExists(id)) return res.status(404).json({ error: 'Tenant non trovato' });
    const { rows } = await withTenantClient(id, (db) =>
      db.query('SELECT key, value FROM settings WHERE key = ANY($1)', [RECEIPT_SETTINGS_KEYS]), masterPool);
    res.json(Object.fromEntries(rows.map(r => [r.key, r.value])));
  } catch (err) {
    logger.error({ err }, 'Errore GET /api/master/tenants/:id/receipt');
    res.status(500).json({ error: 'Errore caricamento personalizzazione' });
  }
});

router.put('/tenants/:id/receipt', authenticateMaster, validate({ params: idParamsSchema, body: receiptCustomizationSchema }), async (req, res) => {
  const { id } = req.params;
  try {
    if (!await tenantExists(id)) return res.status(404).json({ error: 'Tenant non trovato' });
    await withTenantClient(id, (client) => inTransaction(client, async (db) => {
      for (const key of RECEIPT_SETTINGS_KEYS) {
        const value = req.body[key];
        if (value) {
          await db.query(
            'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (tenant_id, key) DO UPDATE SET value = $2', [key, value]);
        } else {
          await db.query('DELETE FROM settings WHERE key = $1', [key]);
        }
      }
    }), masterPool);
    logger.info({ tenantId: id }, 'Personalizzazione scontrini aggiornata dal master');
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, 'Errore PUT /api/master/tenants/:id/receipt');
    res.status(500).json({ error: 'Errore salvataggio personalizzazione' });
  }
});

// UTENTI DI UN TENANT — il master li vede e li gestisce con la connessione scoped al tenant (come la personalizzazione scontrini).
// Le azioni si registrano nell'audit del tenant senza utente (user_id nullo = master).
router.get('/tenants/:id/users', authenticateMaster, validate({ params: idParamsSchema }), async (req, res) => {
  const { id } = req.params;
  try {
    if (!await tenantExists(id)) return res.status(404).json({ error: 'Tenant non trovato' });
    res.json(await withTenantClient(id, listUsers, masterPool));
  } catch (err) {
    logger.error({ err }, 'Errore GET /api/master/tenants/:id/users');
    res.status(500).json({ error: 'Errore caricamento utenti' });
  }
});

router.post('/tenants/:id/users', authenticateMaster, validate({ params: idParamsSchema, body: createUserSchema }), async (req, res) => {
  const { id } = req.params;
  try {
    if (!await tenantExists(id)) return res.status(404).json({ error: 'Tenant non trovato' });
    const user = await withTenantClient(id, async (db) => {
      const created = await createUser(db, id, req.body);
      await logAudit(db, null, 'MASTER_CREATE_USER', { userId: created.id, role: created.role });
      return created;
    }, masterPool);
    res.status(201).json(user);
  } catch (err) {
    if (sendHttpError(res, err)) return;
    logger.error({ err }, 'Errore POST /api/master/tenants/:id/users');
    res.status(500).json({ error: 'Errore creazione utente' });
  }
});

router.patch('/tenants/:id/users/:userId', authenticateMaster, validate({ params: tenantUserParamsSchema, body: updateUserSchema }), async (req, res) => {
  const { id, userId } = req.params;
  try {
    if (!await tenantExists(id)) return res.status(404).json({ error: 'Tenant non trovato' });
    const user = await withTenantClient(id, async (db) => {
      const { previous, ...updated } = await updateUser(db, id, userId, req.body);
      await logAudit(db, null, 'MASTER_UPDATE_USER', { userId, previous, role: updated.role, username: updated.username });
      return updated;
    }, masterPool);
    res.json(user);
  } catch (err) {
    if (sendHttpError(res, err)) return;
    logger.error({ err }, 'Errore PATCH /api/master/tenants/:id/users/:userId');
    res.status(500).json({ error: 'Errore modifica utente' });
  }
});

router.delete('/tenants/:id/users/:userId', authenticateMaster, validate({ params: tenantUserParamsSchema }), async (req, res) => {
  const { id, userId } = req.params;
  try {
    if (!await tenantExists(id)) return res.status(404).json({ error: 'Tenant non trovato' });
    await withTenantClient(id, async (db) => {
      const user = await deleteUser(db, id, userId);
      await logAudit(db, null, 'MASTER_DELETE_USER', { userId, username: user.username, role: user.role });
    }, masterPool);
    res.json({ ok: true });
  } catch (err) {
    if (sendHttpError(res, err)) return;
    logger.error({ err }, 'Errore DELETE /api/master/tenants/:id/users/:userId');
    res.status(500).json({ error: 'Errore eliminazione utente' });
  }
});

router.post('/tenants/:id/users/:userId/reset-password', authenticateMaster, validate({ params: tenantUserParamsSchema, body: resetPasswordSchema }), async (req, res) => {
  const { id, userId } = req.params;
  try {
    if (!await tenantExists(id)) return res.status(404).json({ error: 'Tenant non trovato' });
    await withTenantClient(id, async (db) => {
      await resetUserPassword(db, id, userId, req.body.password);
      await logAudit(db, null, 'MASTER_RESET_PASSWORD', { userId });
    }, masterPool);
    res.json({ ok: true });
  } catch (err) {
    if (sendHttpError(res, err)) return;
    logger.error({ err }, 'Errore POST /api/master/tenants/:id/users/:userId/reset-password');
    res.status(500).json({ error: 'Errore reimpostazione password' });
  }
});

// ELIMINA — irreversibile, cancella anche tutti i dati del tenant.
// Richiede conferma esplicita (slug ripetuto) lato client prima di chiamarla.
// Tutto in un'unica transazione sulla connessione scoped al tenant: o sparisce
// tutto o non sparisce niente. L'ordine rispetta le foreign key (audit_logs → users).
const TENANT_SCOPED_TABLES = ['audit_logs', 'payment_items', 'order_items', 'orders', 'payments', 'checks', 'dining_tables', 'rooms', 'devices', 'products', 'sessions', 'print_settings', 'copy_types', 'settings', 'users'];
router.delete('/tenants/:id', authenticateMaster, validate({ params: idParamsSchema, body: deleteTenantSchema }), async (req, res) => {
  const { id } = req.params;
  try {
    const { rows: check } = await masterPool.query('SELECT slug FROM tenants WHERE id = $1', [id]);
    if (!check.length) return res.status(404).json({ error: 'Tenant non trovato' });
    if (req.body.confirmSlug !== check[0].slug)
      return res.status(400).json({ error: 'Conferma slug non corrispondente' });

    await withTenantClient(id, (client) => inTransaction(client, async (db) => {
      for (const tbl of TENANT_SCOPED_TABLES) {
        await db.query(`DELETE FROM ${tbl} WHERE tenant_id = $1`, [id]);
      }
      await db.query('DELETE FROM tenants WHERE id = $1', [id]);
    }), masterPool);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, 'Errore eliminazione tenant');
    res.status(500).json({ error: 'Errore eliminazione tenant' });
  }
});

export default router;
