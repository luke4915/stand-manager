import express from 'express';
import { authenticate, authorizeCash, authorizeDiscount } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';
import { tenantScope } from '../middleware/tenantScope.js';
import { inTransaction } from '../db.js';
import logger from '../logger.js';
import { logAudit } from '../utils/auditLogger.js';
import { HttpError, sendHttpError } from '../utils/httpError.js';
import { requireModule } from '../utils/tenantModules.js';
import { getCheckDetail, getCheckSummary, listChecks } from '../utils/checks.js';
import { idParamsSchema } from '../schemas/common.js';
import { openCheckSchema, listChecksQuerySchema, billRequestSchema } from '../schemas/checkSchema.js';

// Conti dei tavoli (modulo `tables`). Eventi WebSocket: `check_updated` (solo personale, mai al KDS pubblico).
const router = express.Router();
const guard = [authenticate, requireModule('tables'), authorizeCash];

export default function (broadcast) {
  const notify = (tenantId, check) => broadcast?.(tenantId, { type: 'check_updated', check });

  // GET /api/checks?status=open&table_id= — elenco (la mappa della sala)
  router.get('/', ...guard, validate({ query: listChecksQuerySchema }), tenantScope, async (req, res) => {
    try {
      res.json(await listChecks(req.db, { status: req.validQuery.status, tableId: req.validQuery.table_id }));
    } catch (err) {
      logger.error({ err }, 'Errore GET /api/checks');
      res.status(500).json({ error: 'Errore caricamento conti' });
    }
  });

  // POST /api/checks — apre il conto di un tavolo nella sessione aperta
  router.post('/', ...guard, validate({ body: openCheckSchema }), tenantScope, async (req, res) => {
    const { table_id, covers } = req.body;
    try {
      const id = await inTransaction(req.db, async (db) => {
        const { rows: sessions } = await db.query('SELECT id FROM sessions WHERE end_time IS NULL FOR SHARE');
        if (!sessions.length) throw new HttpError(409, 'Nessuna sessione attiva: apri una sessione prima di aprire un tavolo', 'NO_ACTIVE_SESSION');

        const { rows: tables } = await db.query('SELECT id, active FROM dining_tables WHERE id = $1', [table_id]);
        if (!tables.length) throw new HttpError(404, 'Tavolo non trovato');
        if (!tables[0].active) throw new HttpError(409, 'Il tavolo è disattivato', 'TABLE_INACTIVE');

        // Aperture contemporanee nella stessa sessione si mettono in fila: ognuna vede l'ultimo numero dato.
        await db.query(`SELECT pg_advisory_xact_lock(hashtextextended('checks:' || current_setting('app.tenant_id') || ':' || $1::text, 0))`, [sessions[0].id]);
        const { rows } = await db.query(
          `INSERT INTO checks (session_id, table_id, number, covers, opened_by)
           VALUES ($1, $2, (SELECT COALESCE(MAX(number), 0) + 1 FROM checks WHERE session_id = $1), $3, $4) RETURNING id`,
          [sessions[0].id, table_id, covers, req.user.id]);
        return rows[0].id;
      });
      const check = await getCheckSummary(req.db, id);
      await logAudit(req.db, req.user.id, 'OPEN_CHECK', { checkId: id, tableId: table_id, covers });
      notify(req.user.tenantId, check);
      res.status(201).json(check);
    } catch (err) {
      if (err.code === '23505' && err.constraint === 'uniq_checks_open_table')
        return res.status(409).json({ error: 'Il tavolo ha già un conto aperto', code: 'TABLE_BUSY' });
      if (sendHttpError(res, err)) return;
      logger.error({ err }, 'Errore POST /api/checks');
      res.status(500).json({ error: 'Errore apertura tavolo' });
    }
  });

  // GET /api/checks/:id — il conto con comande e righe
  router.get('/:id', ...guard, validate({ params: idParamsSchema }), tenantScope, async (req, res) => {
    try {
      res.json(await getCheckDetail(req.db, req.params.id));
    } catch (err) {
      if (sendHttpError(res, err)) return;
      logger.error({ err }, 'Errore GET /api/checks/:id');
      res.status(500).json({ error: 'Errore caricamento conto' });
    }
  });

  // POST /api/checks/:id/bill-request — il tavolo chiede il conto (o si annulla la richiesta)
  router.post('/:id/bill-request', ...guard, validate({ params: idParamsSchema, body: billRequestSchema }), tenantScope, async (req, res) => {
    try {
      const { rowCount } = await req.db.query(
        `UPDATE checks SET bill_requested_at = CASE WHEN $2 THEN COALESCE(bill_requested_at, now()) ELSE NULL END
         WHERE id = $1 AND status = 'open'`, [req.params.id, req.body.requested]);
      if (!rowCount) {
        const exists = await getCheckSummary(req.db, req.params.id);
        return exists
          ? res.status(409).json({ error: 'Il conto non è più aperto', code: 'CHECK_CLOSED' })
          : res.status(404).json({ error: 'Conto non trovato' });
      }
      const check = await getCheckSummary(req.db, req.params.id);
      await logAudit(req.db, req.user.id, req.body.requested ? 'REQUEST_BILL' : 'CANCEL_BILL_REQUEST', { checkId: check.id });
      notify(req.user.tenantId, check);
      res.json(check);
    } catch (err) {
      logger.error({ err }, 'Errore POST /api/checks/:id/bill-request');
      res.status(500).json({ error: 'Errore richiesta del conto' });
    }
  });

  // POST /api/checks/:id/void — annulla un conto aperto per errore. Solo ruoli sconto, e solo senza comande attive:
  // con delle comande si annullano prima quelle (lo stock torna).
  router.post('/:id/void', authenticate, requireModule('tables'), authorizeDiscount, validate({ params: idParamsSchema }), tenantScope, async (req, res) => {
    try {
      await inTransaction(req.db, async (db) => {
        const { rows } = await db.query('SELECT status FROM checks WHERE id = $1 FOR UPDATE', [req.params.id]);
        if (!rows.length) throw new HttpError(404, 'Conto non trovato');
        if (rows[0].status !== 'open') throw new HttpError(409, 'Il conto non è più aperto', 'CHECK_CLOSED');
        const { rows: active } = await db.query(`SELECT 1 FROM orders WHERE check_id = $1 AND status <> 'canceled' LIMIT 1`, [req.params.id]);
        if (active.length) throw new HttpError(409, 'Il conto ha comande attive: annullale prima', 'CHECK_HAS_ORDERS');
        await db.query(`UPDATE checks SET status = 'void', closed_at = now(), bill_requested_at = NULL WHERE id = $1`, [req.params.id]);
      });
      const check = await getCheckSummary(req.db, req.params.id);
      await logAudit(req.db, req.user.id, 'VOID_CHECK', { checkId: check.id });
      notify(req.user.tenantId, check);
      res.json(check);
    } catch (err) {
      if (sendHttpError(res, err)) return;
      logger.error({ err }, 'Errore POST /api/checks/:id/void');
      res.status(500).json({ error: 'Errore annullamento conto' });
    }
  });

  return router;
}
