import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import { withTenantClient } from '../middleware/tenantScope.js';
import { authenticateMaster } from '../middleware/authenticateMaster.js';
import logger from '../logger.js';

const router = express.Router();

const setMasterCookie = (res, token) => res.cookie('master_token', token, {
  httpOnly: true,
  secure: true,
  sameSite: 'strict', // più restrittivo del cookie tenant: nessun uso cross-site previsto
  path: '/',
  maxAge: 1000 * 60 * 60 * 4, // 4h, sessione corta per un pannello sensibile
});

// LOGIN — password singola (solo tu), hash in env, mai in chiaro nel codice
router.post('/login', async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password richiesta' });
  if (!process.env.MASTER_PASSWORD_HASH || !process.env.MASTER_JWT_SECRET) {
    return res.status(500).json({ error: 'Pannello master non configurato' });
  }
  const valid = await bcrypt.compare(password, process.env.MASTER_PASSWORD_HASH);
  if (!valid) return res.status(401).json({ error: 'Password errata' });

  const token = jwt.sign({ master: true }, process.env.MASTER_JWT_SECRET, { expiresIn: '4h' });
  setMasterCookie(res, token);
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  res.cookie('master_token', '', { httpOnly: true, secure: true, sameSite: 'strict', path: '/', expires: new Date(0) });
  res.json({ ok: true });
});

// LISTA TENANT — tabella tenants non ha RLS, query diretta legittima
router.get('/tenants', authenticateMaster, async (req, res) => {
  try {
    const { rows } = await pool.query(
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
router.post('/tenants', authenticateMaster, async (req, res) => {
  const { slug, name, plan, expiresInDays, adminUsername } = req.body;
  if (!slug?.trim() || !name?.trim() || !adminUsername?.trim())
    return res.status(400).json({ error: 'slug, name e adminUsername sono richiesti' });
  if (!/^[a-z0-9-]+$/.test(slug))
    return res.status(400).json({ error: 'slug: solo lettere minuscole, numeri e trattini' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

    const { rows: tenantRows } = await client.query(
      `INSERT INTO tenants (slug, name, plan, expires_at) VALUES ($1, $2, $3, $4) RETURNING *`,
      [slug.trim(), name.trim(), plan || 'trial', expiresAt]
    );
    const tenant = tenantRows[0];

    // L'INSERT su users è soggetto a RLS (WITH CHECK): serve il contesto del
    // nuovo tenant sulla connessione, non basta essere dentro la transazione.
    await client.query('SELECT set_config($1, $2, false)', ['app.tenant_id', String(tenant.id)]);
    const { rows: userRows } = await client.query(
      `INSERT INTO users (username, role, tenant_id) VALUES ($1, 'admin', $2) RETURNING id, username, role`,
      [adminUsername.trim(), tenant.id]
    );

    await client.query('COMMIT');
    res.status(201).json({ tenant, admin: userRows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505')
      return res.status(409).json({ error: 'Slug o username già esistente' });
    logger.error({ err }, 'Errore creazione tenant');
    res.status(500).json({ error: 'Errore creazione tenant' });
  } finally {
    client.release();
  }
});

// ESTENDI LICENZA — aggiunge N giorni partendo da oggi o dalla scadenza attuale, quella più lontana
router.patch('/tenants/:id/extend', authenticateMaster, async (req, res) => {
  const days = Number(req.body.days);
  if (!days || days <= 0) return res.status(400).json({ error: 'days deve essere un numero positivo' });
  try {
    const { rows } = await pool.query(
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

// ATTIVA/DISATTIVA — reversibile, non tocca i dati
router.patch('/tenants/:id/active', authenticateMaster, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'UPDATE tenants SET active = $1 WHERE id = $2 RETURNING *',
      [!!req.body.active, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Tenant non trovato' });
    res.json(rows[0]);
  } catch (err) {
    logger.error({ err }, 'Errore attivazione/disattivazione tenant');
    res.status(500).json({ error: 'Errore attivazione/disattivazione tenant' });
  }
});

// ELIMINA — irreversibile, cancella anche tutti i dati del tenant.
// Richiede conferma esplicita (slug ripetuto) lato client prima di chiamarla.
// Tutto in un'unica transazione sulla connessione scoped al tenant: o sparisce
// tutto o non sparisce niente. L'ordine rispetta le foreign key (audit_logs → users).
const TENANT_SCOPED_TABLES = ['audit_logs', 'orders', 'products', 'sessions', 'print_settings', 'copy_types', 'settings', 'users'];
router.delete('/tenants/:id', authenticateMaster, async (req, res) => {
  const { id } = req.params;
  try {
    const { rows: check } = await pool.query('SELECT slug FROM tenants WHERE id = $1', [id]);
    if (!check.length) return res.status(404).json({ error: 'Tenant non trovato' });
    if (req.body.confirmSlug !== check[0].slug)
      return res.status(400).json({ error: 'Conferma slug non corrispondente' });

    await withTenantClient(id, async (db) => {
      try {
        await db.query('BEGIN');
        for (const tbl of TENANT_SCOPED_TABLES) {
          await db.query(`DELETE FROM ${tbl} WHERE tenant_id = $1`, [id]);
        }
        await db.query('DELETE FROM tenants WHERE id = $1', [id]);
        await db.query('COMMIT');
      } catch (err) {
        await db.query('ROLLBACK');
        throw err;
      }
    });
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, 'Errore eliminazione tenant');
    res.status(500).json({ error: 'Errore eliminazione tenant' });
  }
});

export default router;
