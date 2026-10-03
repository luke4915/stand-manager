import express from 'express';
import { inTransaction } from '../db.js';
import { authenticate, authorizeAdmin } from '../middleware/authenticate.js';
import { tenantScope } from '../middleware/tenantScope.js';
import logger from '../logger.js';
import { logAudit } from '../utils/auditLogger.js';
import { startSessionSchema, endSessionSchema } from '../schemas/sessionSchema.js';
import { validate } from '../middleware/validate.js';
import { computeExpectedCash } from '../utils/session.js';

const router = express.Router();

export default function (broadcast) {

  router.get('/', authenticate, tenantScope, async (req, res) => {
    try {
      const { rows } = await req.db.query('SELECT * FROM sessions ORDER BY start_time DESC');
      res.json(rows);
    } catch (err) {
      logger.error({ err }, 'Errore GET /api/sessions');
      res.status(500).json({ error: 'Errore caricamento sessioni' });
    }
  });

  router.get('/latest', authenticate, tenantScope, async (req, res) => {
    try {
      const { rows } = await req.db.query('SELECT * FROM sessions ORDER BY start_time DESC LIMIT 1');
      res.json(rows[0] || null);
    } catch (err) {
      logger.error({ err }, 'Errore GET /api/sessions/latest');
      res.status(500).json({ error: 'Errore caricamento sessione' });
    }
  });

  // GET /expected-cash — totale atteso (solo contanti) della sessione aperta
  router.get('/expected-cash', authenticate, tenantScope, async (req, res) => {
    try {
      const { rows } = await req.db.query('SELECT id FROM sessions WHERE end_time IS NULL');
      res.json({ expected: rows.length ? await computeExpectedCash(req.db, rows[0].id) : 0 });
    } catch (err) {
      logger.error({ err }, 'Errore GET /api/sessions/expected-cash');
      res.status(500).json({ error: 'Errore calcolo del totale atteso' });
    }
  });

  // POST /start — apre la sessione e riparte con disponibilità illimitata:
  // si presume che i prodotti siano stati riforniti, lo stock va reimpostato se serve.
  router.post('/start', authenticate, authorizeAdmin, validate({ body: startSessionSchema }), tenantScope, async (req, res) => {
    try {
      const session = await inTransaction(req.db, async (db) => {
        const { rows } = await db.query(
          'INSERT INTO sessions (name, start_time) VALUES ($1, NOW()) RETURNING *',
          [req.body.name]
        );
        // I prodotti nascosti perché esauriti (stock 0) tornano visibili;
        // quelli nascosti a mano dall'admin restano nascosti.
        await db.query(
          `UPDATE products
           SET stock = NULL, stock_enabled = false,
               visible = CASE WHEN stock = 0 THEN true ELSE visible END
           WHERE stock_enabled`
        );
        return rows[0];
      });

      await logAudit(req.db, req.user.id, 'START_SESSION', { sessionId: session.id, sessionName: session.name });

      if (broadcast) broadcast(req.user.tenantId, { type: 'session_started', session });
      res.json(session);
    } catch (err) {
      // uniq_sessions_open_per_tenant: esiste già una sessione aperta
      if (err.code === '23505') return res.status(409).json({ error: 'Esiste già una sessione attiva' });
      logger.error({ err }, 'Errore POST /api/sessions/start');
      res.status(500).json({ error: "Errore durante l'apertura della sessione" });
    }
  });

  // POST /end — chiude la sessione con il conto cassa.
  // Il lock sulla sessione mette in attesa gli ordini in arrivo: o entrano nel
  // totale atteso, o trovano la sessione chiusa e vengono rifiutati.
  router.post('/end', authenticate, authorizeAdmin, validate({ body: endSessionSchema }), tenantScope, async (req, res) => {
    const declared = req.body.declaredCash ?? null;

    try {
      const result = await inTransaction(req.db, async (db) => {
        const { rows: active } = await db.query('SELECT id FROM sessions WHERE end_time IS NULL FOR UPDATE');
        if (!active.length) return null;

        const expectedCash = await computeExpectedCash(db, active[0].id);
        const { rows } = await db.query(
          `UPDATE sessions SET end_time = NOW(), expected_cash = $1, declared_cash = $2
           WHERE id = $3 RETURNING *`,
          [expectedCash, declared, active[0].id]
        );
        return { session: rows[0], expectedCash };
      });
      if (!result) return res.json(null);

      const { session, expectedCash } = result;
      await logAudit(req.db, req.user.id, 'END_SESSION', {
        sessionId: session.id,
        sessionName: session.name,
        expectedCash,
        declaredCash: declared,
        difference: declared !== null ? +(declared - expectedCash).toFixed(2) : null
      });

      if (broadcast) broadcast(req.user.tenantId, { type: 'session_ended', session });
      res.json(session);
    } catch (err) {
      logger.error({ err }, 'Errore POST /api/sessions/end');
      res.status(500).json({ error: 'Errore durante la chiusura della sessione' });
    }
  });

  return router;
}
