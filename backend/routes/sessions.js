import express from 'express';
import { pool } from '../db.js';
import { authenticate, authorizeAdmin } from '../middleware/authenticate.js';
import { tenantScope } from '../middleware/tenantScope.js';
import logger from '../logger.js'
// 🔴 NUOVO IMPORT
import { logAudit } from '../utils/auditLogger.js';

const router = express.Router();

export default function (broadcast) {

  router.get('/', authenticate, tenantScope, async (req, res) => {
    try {
      const { rows } = await req.db.query('SELECT * FROM sessions ORDER BY start_time DESC');
      res.json(rows);
    }
    catch (err) {
      logger.error({ err }, 'db error');
      res.status(500).json({ error: 'db error' });
    }
  });

  router.get('/latest', authenticate, tenantScope, async (req, res) => {
    try {
      const { rows } = await req.db.query('SELECT * FROM sessions ORDER BY start_time DESC LIMIT 1');
      res.json(rows[0] || null);
    } catch (err) {
      logger.error({ err }, 'db error');
      res.status(500).json({ error: 'db error' });
    }
  });

    // GET /expected-cash — totale atteso (solo contanti) della sessione attiva
  router.get('/expected-cash', authenticate, tenantScope, async (req, res) => {
    try {
      const { rows: active } = await req.db.query(
        'SELECT start_time FROM sessions WHERE end_time IS NULL ORDER BY start_time DESC LIMIT 1'
      );
      if (!active.length) return res.json({ expected: 0 });

      const { rows } = await req.db.query(
        `SELECT COALESCE(SUM(total), 0) AS expected FROM orders WHERE status = 'completed' AND created_at >= $1`,
        [active[0].start_time]
      );
      res.json({ expected: parseFloat(rows[0].expected) });
    } catch (err) {
      logger.error({ err }, 'db error');
      res.status(500).json({ error: 'db error' });
    }
  });

  // POST /start (Apertura Sessione - TRACCIATO)
  router.post('/start', authenticate, authorizeAdmin, tenantScope, async (req, res) => {
    try {
      const { name } = req.body;
      if (!name?.trim()) return res.status(400).json({ error: 'Nome obbligatorio' });

      const { rows: active } = await req.db.query('SELECT id FROM sessions WHERE end_time IS NULL LIMIT 1');
      if (active.length) return res.status(400).json({ error: 'Esiste già una sessione attiva' });

      const { rows } = await req.db.query(
        'INSERT INTO sessions (name, start_time) VALUES ($1, NOW()) RETURNING *',
        [name.trim()]
      );

      // 🔴 AGGIUNTA: Logghiamo l'apertura della sessione
      await logAudit(req.db, req.user.id, 'START_SESSION', {
        sessionId: rows[0].id,
        sessionName: rows[0].name
      });

      // Reset stock a inizio serata — ripristina visibilità prodotti esauriti
      await req.db.query(
        `UPDATE products
         SET stock = NULL, visible = true
         WHERE stock_enabled = true AND stock = 0`
      );

      if (broadcast) broadcast(req.user.tenantId, { type: 'session_started', session: rows[0] });
      res.json(rows[0]);
    } catch (err) {
      logger.error({ err }, 'db error');
      res.status(500).json({ error: 'db error' });
    }
  });

  // POST /end (Chiusura Sessione - TRACCIATO + conto cassa)
  router.post('/end', authenticate, authorizeAdmin, tenantScope, async (req, res) => {
    try {
      const { declaredCash } = req.body;

      const { rows: activeRows } = await req.db.query(
        `SELECT id, start_time FROM sessions WHERE end_time IS NULL ORDER BY start_time DESC LIMIT 1`
      );
      const active = activeRows[0];
      if (!active) return res.json(null);

      // Solo contanti per ora: totale atteso = somma ordini completati della sessione
      const { rows: totalRows } = await req.db.query(
        `SELECT COALESCE(SUM(total), 0) AS expected
         FROM orders WHERE status = 'completed' AND created_at >= $1`,
        [active.start_time]
      );
      const expectedCash = parseFloat(totalRows[0].expected);
      const declared = declaredCash !== undefined && declaredCash !== null ? parseFloat(declaredCash) : null;

      const { rows } = await req.db.query(
        `UPDATE sessions SET end_time = NOW(), expected_cash = $1, declared_cash = $2
         WHERE id = $3 RETURNING *`,
        [expectedCash, declared, active.id]
      );

      await logAudit(req.db, req.user.id, 'END_SESSION', {
        sessionId: rows[0].id,
        sessionName: rows[0].name,
        expectedCash,
        declaredCash: declared,
        difference: declared !== null ? +(declared - expectedCash).toFixed(2) : null
      });

      if (broadcast) broadcast(req.user.tenantId, { type: 'session_ended', session: rows[0] });
      res.json(rows[0]);
    } catch (err) {
      logger.error({ err }, 'db error');
      res.status(500).json({ error: 'db error' });
    }
  });

  return router;
}