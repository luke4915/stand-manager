import express from 'express';
import { authenticate, authorizeCash, authorizeDiscount } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';
import { tenantScope } from '../middleware/tenantScope.js';
import { inTransaction } from '../db.js';
import logger from '../logger.js';
import { logAudit } from '../utils/auditLogger.js';
import { HttpError, sendHttpError } from '../utils/httpError.js';
import { requireModule } from '../utils/tenantModules.js';
import { getCheckDetail, getCheckSummary, listChecks, getCheckReceipt } from '../utils/checks.js';
import { recordPayment, lockCheck, checkBalance, closeAsPaid, toCents } from '../utils/payments.js';
import { computeLineTotal, sanitizeAdjustment } from '../utils/pricing.js';
import { sumQuantitiesByProduct, applyStockChange } from '../utils/stock.js';
import { loadItems } from '../utils/orderItemsRead.js';
import { withCheckInfo } from '../utils/orderCheck.js';
import { readCoverCharge, syncCoverOrder } from '../utils/cover.js';
import { idParamsSchema } from '../schemas/common.js';
import { openCheckSchema, listChecksQuerySchema, billRequestSchema, paymentSchema, adjustSchema, voidCheckSchema, receiptQuerySchema, moveCheckSchema, mergeCheckSchema, coversSchema } from '../schemas/checkSchema.js';

// Conti dei tavoli (modulo `tables`). Eventi WebSocket: `check_updated` (solo personale, mai al KDS pubblico).
const router = express.Router();
const guard = [authenticate, requireModule('tables'), authorizeCash];

export default function (broadcast) {
  const notify = (tenantId, check) => broadcast?.(tenantId, { type: 'check_updated', check });
  // Le comande cambiate (sconto, annullo, nuovo tavolo) si rimandano a cucina e personale, con tavolo e coperti aggiornati.
  const notifyOrders = async (db, tenantId, orderIds) => {
    if (!broadcast || !orderIds.length) return;
    const { rows } = await db.query('SELECT * FROM orders WHERE id = ANY($1::int[])', [orderIds]);
    const byOrder = await loadItems(db, orderIds);
    for (const o of await withCheckInfo(db, rows))
      broadcast(tenantId, { type: 'order_updated', order: { ...o, items: byOrder.get(o.id) ?? [] } });
  };

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
          `INSERT INTO checks (session_id, table_id, number, covers, opened_by, cover_charge)
           VALUES ($1, $2, (SELECT COALESCE(MAX(number), 0) + 1 FROM checks WHERE session_id = $1), $3, $4, $5) RETURNING id`,
          [sessions[0].id, table_id, covers, req.user.id, await readCoverCharge(db)]);
        await syncCoverOrder(db, req.user.tenantId, rows[0].id, req.user.id);
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

  // POST /api/checks/:id/payments — registra un pagamento: a importo (`amount`, alla romana o acconto) oppure per voce
  // (`items`, conti separati). Chiude il conto quando il residuo arriva a zero. L'importo delle voci lo calcola il server.
  router.post('/:id/payments', ...guard, validate({ params: idParamsSchema, body: paymentSchema }), tenantScope, async (req, res) => {
    const { method, amount, items, tendered } = req.body;
    try {
      const result = await inTransaction(req.db, async (db) => {
        const paid = await recordPayment(db, { checkId: req.params.id, method, amount, items, userId: req.user.id });
        if (tendered !== undefined && toCents(tendered) < toCents(paid.payment.amount))
          throw new HttpError(400, 'I contanti consegnati non bastano', 'TENDERED_TOO_LOW');
        return paid;
      });
      const check = await getCheckSummary(req.db, req.params.id);
      await logAudit(req.db, req.user.id, 'PAYMENT', {
        checkId: check.id, paymentId: result.payment.id, method, amount: result.payment.amount, items: items?.length ?? 0, closed: result.closed,
      });
      notify(req.user.tenantId, check);
      res.status(201).json({
        payment: result.payment, check,
        ...(tendered !== undefined && { change: +(tendered - result.payment.amount).toFixed(2) }),
      });
    } catch (err) {
      if (sendHttpError(res, err)) return;
      logger.error({ err }, 'Errore POST /api/checks/:id/payments');
      res.status(500).json({ error: 'Errore registrazione pagamento' });
    }
  });

  // POST /api/checks/:id/close — chiude come pagato un conto con residuo zero senza altri pagamenti
  // (per esempio dopo un omaggio su tutte le voci).
  router.post('/:id/close', ...guard, validate({ params: idParamsSchema }), tenantScope, async (req, res) => {
    try {
      await inTransaction(req.db, async (db) => {
        await lockCheck(db, req.params.id);
        if ((await checkBalance(db, req.params.id)).due > 0)
          throw new HttpError(409, 'Il conto ha ancora un residuo da pagare', 'CHECK_NOT_SETTLED');
        await closeAsPaid(db, req.params.id);
      });
      const check = await getCheckSummary(req.db, req.params.id);
      await logAudit(req.db, req.user.id, 'CLOSE_CHECK', { checkId: check.id });
      notify(req.user.tenantId, check);
      res.json(check);
    } catch (err) {
      if (sendHttpError(res, err)) return;
      logger.error({ err }, 'Errore POST /api/checks/:id/close');
      res.status(500).json({ error: 'Errore chiusura conto' });
    }
  });

  // POST /api/checks/:id/adjust — abbuono: omaggio o sconto su delle voci del conto (solo ruoli sconto).
  // Le voci già pagate non si toccano. Le statistiche restano giuste: sono le righe a cambiare.
  router.post('/:id/adjust', authenticate, requireModule('tables'), authorizeDiscount, validate({ params: idParamsSchema, body: adjustSchema }), tenantScope, async (req, res) => {
    const { order_item_ids: ids, type, discountMode, discountValue } = req.body;
    try {
      const orderIds = await inTransaction(req.db, async (db) => {
        await lockCheck(db, req.params.id);
        const { rows: lines } = await db.query(
          `SELECT oi.id, oi.order_id, oi.quantity, oi.original_price
           FROM order_items oi JOIN orders o ON o.id = oi.order_id AND o.check_id = $1 AND o.status <> 'canceled'
           WHERE oi.id = ANY($2::int[]) FOR UPDATE OF oi`, [req.params.id, ids]);
        if (lines.length !== ids.length) throw new HttpError(404, 'Una delle righe non fa parte del conto', 'ITEM_NOT_FOUND');
        const { rows: paid } = await db.query('SELECT 1 FROM payment_items WHERE order_item_id = ANY($1::int[]) LIMIT 1', [ids]);
        if (paid.length) throw new HttpError(409, 'Una delle righe è già stata pagata (in parte o per intero)', 'ITEM_PAID');
        if (lines.some(l => l.original_price === null)) throw new HttpError(409, 'Una riga non ha il prezzo di listino', 'NO_LIST_PRICE');

        const adjustment = sanitizeAdjustment({ type, discountMode, discountValue }, true);
        for (const l of lines) {
          const lineTotal = computeLineTotal(Number(l.original_price), l.quantity, adjustment);
          await db.query(
            `UPDATE order_items SET line_total = $1, unit_price = $2, line_type = $3, discount_mode = $4, discount_value = $5 WHERE id = $6`,
            [lineTotal, lineTotal / l.quantity, adjustment.type, adjustment.discountMode, adjustment.discountValue, l.id]);
        }
        const affected = [...new Set(lines.map(l => l.order_id))];
        await db.query(
          `UPDATE orders o SET total = t.total, order_type = CASE WHEN o.order_type = 'cover' THEN 'cover' ELSE t.order_type END
           FROM (SELECT order_id, SUM(line_total) AS total,
                        CASE WHEN bool_and(line_type = 'gift') THEN 'gift' WHEN bool_or(line_type <> 'sale') THEN 'discount' ELSE 'sale' END AS order_type
                 FROM order_items WHERE order_id = ANY($1::int[]) GROUP BY order_id) t
           WHERE o.id = t.order_id`, [affected]);

        const balance = await checkBalance(db, req.params.id);
        if (balance.paid > balance.total)
          throw new HttpError(409, 'Il conto è già stato pagato oltre il nuovo totale', 'ORDER_PAID');
        return affected;
      });
      const check = await getCheckSummary(req.db, req.params.id);
      await logAudit(req.db, req.user.id, 'ADJUST_CHECK', { checkId: check.id, type, discountMode, discountValue, items: ids.length, total: check.total });
      await notifyOrders(req.db, req.user.tenantId, orderIds);
      notify(req.user.tenantId, check);
      res.json(check);
    } catch (err) {
      if (sendHttpError(res, err)) return;
      logger.error({ err }, 'Errore POST /api/checks/:id/adjust');
      res.status(500).json({ error: 'Errore applicazione sconto' });
    }
  });

  // GET /api/checks/:id/receipt[?payment_id=] — dati della ricevuta NON fiscale: di tutto il conto, o di un solo
  // pagamento (la quota di chi ha pagato per voce). La stampa è del client (print/templates.js).
  router.get('/:id/receipt', ...guard, validate({ params: idParamsSchema, query: receiptQuerySchema }), tenantScope, async (req, res) => {
    try {
      res.json(await getCheckReceipt(req.db, req.params.id, req.validQuery.payment_id ?? null));
    } catch (err) {
      if (sendHttpError(res, err)) return;
      logger.error({ err }, 'Errore GET /api/checks/:id/receipt');
      res.status(500).json({ error: 'Errore ricevuta' });
    }
  });

  // POST /api/checks/:id/void — annulla un conto aperto (solo ruoli sconto). Con comande attive serve
  // `cancel_orders` (solo admin): le comande vengono annullate e lo stock torna. Con pagamenti già incassati non si
  // annulla: i soldi sono stati presi.
  router.post('/:id/void', authenticate, requireModule('tables'), authorizeDiscount, validate({ params: idParamsSchema, body: voidCheckSchema }), tenantScope, async (req, res) => {
    const { cancel_orders: cancelOrders } = req.body;
    if (cancelOrders && req.user.role !== 'admin')
      return res.status(403).json({ error: 'Solo un amministratore può eliminare un conto con le sue comande' });
    try {
      const { canceledIds, stockUpdates } = await inTransaction(req.db, async (db) => {
        await lockCheck(db, req.params.id);
        const { rows: payments } = await db.query('SELECT 1 FROM payments WHERE check_id = $1 LIMIT 1', [req.params.id]);
        if (payments.length) throw new HttpError(409, 'Il conto ha già dei pagamenti: non si può annullare', 'CHECK_HAS_PAYMENTS');

        let canceledIds = [], stockUpdates = [];
        const { rows: active } = await db.query(`SELECT id, order_type FROM orders WHERE check_id = $1 AND status <> 'canceled' FOR UPDATE`, [req.params.id]);
        // Il coperto è automatico: non conta come comanda, si annulla insieme al conto.
        if (active.some(o => o.order_type !== 'cover') && !cancelOrders) throw new HttpError(409, 'Il conto ha comande attive: annullale prima', 'CHECK_HAS_ORDERS');
        if (active.length) {
          canceledIds = active.map(o => o.id);
          await db.query(`UPDATE orders SET status = 'canceled' WHERE id = ANY($1::int[])`, [canceledIds]);
          const items = [...(await loadItems(db, canceledIds)).values()].flat().filter(i => i.id !== null);
          stockUpdates = await applyStockChange(db, sumQuantitiesByProduct(items), +1);
        }
        await db.query(`UPDATE checks SET status = 'void', closed_at = now(), bill_requested_at = NULL WHERE id = $1`, [req.params.id]);
        return { canceledIds, stockUpdates };
      });
      const check = await getCheckSummary(req.db, req.params.id);
      await logAudit(req.db, req.user.id, 'VOID_CHECK', { checkId: check.id, ...(canceledIds.length && { canceledOrders: canceledIds.length }) });
      stockUpdates.forEach(product => broadcast?.(req.user.tenantId, { type: 'product_stock_updated', product }));
      await notifyOrders(req.db, req.user.tenantId, canceledIds);
      notify(req.user.tenantId, check);
      res.json(check);
    } catch (err) {
      if (sendHttpError(res, err)) return;
      logger.error({ err }, 'Errore POST /api/checks/:id/void');
      res.status(500).json({ error: 'Errore annullamento conto' });
    }
  });

  // POST /api/checks/:id/covers — cambia i coperti (arrivano altri clienti, o qualcuno se ne va); il coperto si adegua.
  router.post('/:id/covers', ...guard, validate({ params: idParamsSchema, body: coversSchema }), tenantScope, async (req, res) => {
    try {
      const previous = await inTransaction(req.db, async (db) => {
        await lockCheck(db, req.params.id);
        const { rows: [before] } = await db.query('SELECT covers FROM checks WHERE id = $1', [req.params.id]);
        await db.query('UPDATE checks SET covers = $1 WHERE id = $2', [req.body.covers, req.params.id]);
        await syncCoverOrder(db, req.user.tenantId, req.params.id, req.user.id);
        return before.covers;
      });
      const check = await getCheckSummary(req.db, req.params.id);
      await logAudit(req.db, req.user.id, 'CHANGE_COVERS', { checkId: check.id, from: previous, to: check.covers });
      notify(req.user.tenantId, check);
      res.json(check);
    } catch (err) {
      if (sendHttpError(res, err)) return;
      logger.error({ err }, 'Errore POST /api/checks/:id/covers');
      res.status(500).json({ error: 'Errore modifica coperti' });
    }
  });

  // POST /api/checks/:id/move — sposta il conto su un altro tavolo libero (i clienti si cambiano di posto).
  router.post('/:id/move', ...guard, validate({ params: idParamsSchema, body: moveCheckSchema }), tenantScope, async (req, res) => {
    const { table_id: tableId } = req.body;
    try {
      const { from, orderIds } = await inTransaction(req.db, async (db) => {
        await lockCheck(db, req.params.id);
        const { rows: tables } = await db.query('SELECT id, active FROM dining_tables WHERE id = $1', [tableId]);
        if (!tables.length) throw new HttpError(404, 'Tavolo non trovato');
        if (!tables[0].active) throw new HttpError(409, 'Il tavolo è disattivato', 'TABLE_INACTIVE');
        const { rows: [current] } = await db.query('SELECT table_id FROM checks WHERE id = $1', [req.params.id]);
        if (current.table_id === tableId) throw new HttpError(409, 'Il conto è già su questo tavolo', 'SAME_TABLE');
        await db.query('UPDATE checks SET table_id = $1 WHERE id = $2', [tableId, req.params.id]);   // l'indice unico rifiuta un tavolo occupato
        const { rows: active } = await db.query(`SELECT id FROM orders WHERE check_id = $1 AND status IN ('pending', 'preparing')`, [req.params.id]);
        return { from: current.table_id, orderIds: active.map(o => o.id) };
      });
      const check = await getCheckSummary(req.db, req.params.id);
      await logAudit(req.db, req.user.id, 'MOVE_CHECK', { checkId: check.id, fromTableId: from, toTableId: tableId });
      await notifyOrders(req.db, req.user.tenantId, orderIds);   // la cucina vede il tavolo nuovo
      notify(req.user.tenantId, check);
      res.json(check);
    } catch (err) {
      if (err.code === '23505' && err.constraint === 'uniq_checks_open_table')
        return res.status(409).json({ error: 'Il tavolo ha già un conto aperto: per riunire i tavoli unisci i conti', code: 'TABLE_BUSY' });
      if (sendHttpError(res, err)) return;
      logger.error({ err }, 'Errore POST /api/checks/:id/move');
      res.status(500).json({ error: 'Errore spostamento conto' });
    }
  });

  // POST /api/checks/:id/merge — unisce questo conto in un altro conto aperto: comande, pagamenti e coperti confluiscono
  // nel conto di destinazione, questo resta in archivio come annullato (`merged_into`) e il suo tavolo si libera.
  router.post('/:id/merge', ...guard, validate({ params: idParamsSchema, body: mergeCheckSchema }), tenantScope, async (req, res) => {
    const sourceId = Number(req.params.id), targetId = req.body.into;
    if (sourceId === targetId) return res.status(400).json({ error: 'Scegli un altro conto', code: 'SAME_CHECK' });
    try {
      const { orderIds } = await inTransaction(req.db, async (db) => {
        // Sempre nello stesso ordine (id crescente): due unioni opposte non si incastrano
        for (const id of [sourceId, targetId].sort((a, b) => a - b)) await lockCheck(db, id);
        // Il coperto del conto assorbito si annulla (se non è stato pagato) e quello di destinazione si riallinea ai coperti sommati
        const { rows: [{ covers: sourceCovers }] } = await db.query('SELECT covers FROM checks WHERE id = $1', [sourceId]);
        await db.query(`UPDATE checks SET covers = 0 WHERE id = $1`, [sourceId]);
        await syncCoverOrder(db, req.user.tenantId, sourceId, req.user.id);
        const { rows: moved } = await db.query(`UPDATE orders SET check_id = $1 WHERE check_id = $2 RETURNING id, status`, [targetId, sourceId]);
        await db.query('UPDATE payments SET check_id = $1 WHERE check_id = $2', [targetId, sourceId]);
        await db.query(
          `UPDATE checks t SET covers = LEAST(99, t.covers + $3), bill_requested_at = COALESCE(t.bill_requested_at, s.bill_requested_at)
           FROM checks s WHERE t.id = $1 AND s.id = $2`, [targetId, sourceId, sourceCovers]);
        await db.query(`UPDATE checks SET status = 'void', closed_at = now(), bill_requested_at = NULL, merged_into = $1 WHERE id = $2`, [targetId, sourceId]);
        await syncCoverOrder(db, req.user.tenantId, targetId, req.user.id);
        return { orderIds: moved.filter(o => ['pending', 'preparing'].includes(o.status)).map(o => o.id) };
      });
      const [source, target] = await Promise.all([getCheckSummary(req.db, sourceId), getCheckSummary(req.db, targetId)]);
      await logAudit(req.db, req.user.id, 'MERGE_CHECK', { fromCheckId: sourceId, intoCheckId: targetId });
      await notifyOrders(req.db, req.user.tenantId, orderIds);
      notify(req.user.tenantId, source);
      notify(req.user.tenantId, target);
      res.json(target);
    } catch (err) {
      if (sendHttpError(res, err)) return;
      logger.error({ err }, 'Errore POST /api/checks/:id/merge');
      res.status(500).json({ error: 'Errore unione conti' });
    }
  });

  return router;
}
