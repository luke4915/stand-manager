import express from 'express';
import { inTransaction } from '../db.js';
import { authenticate, authorizeCash, CASH_ROLES, DISCOUNT_ROLES } from '../middleware/authenticate.js';
import { tenantScope, withTenantClient } from '../middleware/tenantScope.js';
import { resolveTenantFromHost } from '../middleware/resolveTenantFromHost.js';
import { computeLineTotal, sanitizeAdjustment } from '../utils/pricing.js';
import logger from '../logger.js';
import { logAudit } from '../utils/auditLogger.js';
import { createOrderSchema, updateOrderStatusSchema, reprintAuditSchema } from '../schemas/orderSchema.js';
import { listOrdersQuerySchema } from '../schemas/statsSchema.js';
import { idParamsSchema } from '../schemas/common.js';
import { validate } from '../middleware/validate.js';
import { toPublicOrder } from '../utils/publicOrder.js';
import { formatDisplayCode, formatDeviceCode } from '../utils/displayCode.js';
import { sumQuantitiesByProduct, lockAndFindShortages, applyStockChange } from '../utils/stock.js';
import { HttpError, sendHttpError } from '../utils/httpError.js';
import { computeExpectedCash, clampToSession } from '../utils/session.js';
import { loadItems, withItems } from '../utils/orderItemsRead.js';
import { writeOrderItems } from '../utils/orderItemsWrite.js';
import { requireModule, getTenantModules } from '../utils/tenantModules.js';
import { withCheckInfo } from '../utils/orderCheck.js';
import { lockCheck, assertOrderCancelable } from '../utils/payments.js';
import { getCheckSummary } from '../utils/checks.js';

const router = express.Router();

const TERMINAL_STATUSES = ['canceled', 'completed'];

// Ordini modalità "semplice": nascono già 'completed' ma senza completed_at
// (valorizzato solo dal flusso cucina). Per questi lo storno è ammesso entro 5 minuti.
const CANCEL_WINDOW_MS = 5 * 60 * 1000;

// Un ordine offline si può sincronizzare nella sua sessione fino a 24 ore dalla chiusura.
const LATE_SYNC_WINDOW = '24 hours';

// Trova la sessione dell'ordine: quella aperta, oppure (ordini offline sincronizzati in ritardo)
// quella in cui l'ordine è stato battuto.
// Con `useCounter` (ordini senza dispositivo, accodati prima della 018) incrementa anche il contatore
// di sessione: il lock sulla riga mette in fila quegli ordini. Gli altri prendono solo un lock condiviso,
// che non li mette in fila tra loro ma impedisce la chiusura della sessione mentre l'ordine si scrive.
async function findOrderSession(db, sessionId, useCounter) {
  const lock = useCounter ? 'UPDATE sessions SET order_counter = order_counter + 1' : null;
  const target = sessionId === undefined ? 'end_time IS NULL' : 'id = $1 AND (end_time IS NULL OR end_time > now() - $2::interval)';
  const params = sessionId === undefined ? [] : [sessionId, LATE_SYNC_WINDOW];
  const { rows } = lock
    ? await db.query(`${lock} WHERE ${target} RETURNING id, order_counter, start_time, end_time`, params)
    : await db.query(`SELECT id, order_counter, start_time, end_time FROM sessions WHERE ${target} FOR SHARE`, params);
  if (rows.length) return rows[0];
  throw sessionId === undefined
    ? new HttpError(409, 'Nessuna sessione attiva: apri una sessione prima di inviare ordini', 'NO_ACTIVE_SESSION')
    : new HttpError(409, "La sessione dell'ordine non esiste o è chiusa da più di 24 ore", 'SESSION_CLOSED');
}

const UNIQUE_ORDER_CONSTRAINTS = ['uniq_orders_client_order_id', 'uniq_orders_device_seq'];

// Codice ordine: se la cassa ha inviato dispositivo e numero (battuto e stampato in locale)
// il server ricompone lettera + numero, senza fidarsi del formato del client. Senza dispositivo
// (ordini accodati prima dell'aggiornamento) vale ancora il progressivo di sessione.
async function resolveDisplayCode(db, session, deviceId, deviceSeq) {
  if (deviceId === undefined) return formatDisplayCode(session.order_counter);
  const { rows } = await db.query('SELECT letter FROM devices WHERE id = $1', [deviceId]);
  if (!rows.length) throw new HttpError(400, 'Dispositivo non valido', 'INVALID_DEVICE');
  return formatDeviceCode(rows[0].letter, deviceSeq);
}

async function findOrderByClientId(db, clientOrderId) {
  const { rows } = await db.query('SELECT id, display_code FROM orders WHERE client_order_id = $1', [clientOrderId]);
  return rows[0] || null;
}

const duplicateResponse = (order) => ({ success: true, orderId: order.id, displayCode: order.display_code, duplicate: true });

export default function (broadcast) {

  // GET /orders — mai l'intero storico: o gli ordini della sessione aperta (`session=active`, `status=` per filtrare),
  // o una pagina alla volta (`limit`, e `before` = id dell'ultimo ricevuto per la pagina successiva).
  // Le statistiche non passano di qui: le calcola il database (routes/stats.js).
  router.get('/', authenticate, validate({ query: listOrdersQuerySchema }), tenantScope, async (req, res) => {
    try {
      const { session, status, limit, before } = req.validQuery;
      const { rows } = await req.db.query(
        `SELECT o.* FROM orders o
         ${session === 'active' ? 'JOIN sessions s ON s.id = o.session_id AND s.end_time IS NULL' : ''}
         WHERE ($1::text[] IS NULL OR o.status = ANY($1))
           AND ($2::int IS NULL OR o.id < $2)
         ORDER BY o.id DESC LIMIT $3`,
        [status ?? null, before ?? null, session === 'active' ? 2000 : limit]
      );

      // 🚀 FIX CRITICO: Recuperiamo la mappatura attuale dei prodotti dal DB per associare le categorie
      const { rows: dbProducts } = await req.db.query('SELECT id, category FROM products');
      const categoryMap = Object.fromEntries(dbProducts.map(p => [p.id, p.category || 'Altro']));

      // Rispediamo i dati mappandoli in modo che ogni item abbia la sua categoria reale
      const mappedRows = (await withCheckInfo(req.db, await withItems(req.db, rows))).map(o => ({
        ...o,
        items: o.items.map(i => ({
          ...i,
          // Se la riga non ha la categoria, la prendiamo dalla mappa aggiornata tramite l'ID prodotto
          category: i.category || categoryMap[i.id] || 'Altro'
        })),
      }));

      res.json(mappedRows);
    } catch (err) {
      logger.error({ err }, 'Errore GET /api/orders:')
      res.status(500).json({ error: 'Errore nel recupero degli ordini' });
    }
  });

  // POST /orders (Creazione Ordine)
  router.post('/', authenticate, authorizeCash, validate({ body: createOrderSchema }), tenantScope, async (req, res) => {
    const { items, status, is_takeaway, client_order_id, session_id, client_created_at, device_id, device_seq, check_id } = req.body;

    // Idempotenza: un ordine già ricevuto (retry dopo un errore di rete o dalla
    // coda offline) non si duplica, si risponde con quello esistente.
    if (client_order_id) {
      const existing = await findOrderByClientId(req.db, client_order_id);
      if (existing) return res.json(duplicateResponse(existing));
    }

    // Le comande dei tavoli esistono solo nei locali con il modulo `tables`.
    if (check_id !== undefined && !(await getTenantModules(req.user.tenantId))?.modules.includes('tables'))
      return res.status(403).json({ error: 'Funzione non attiva per questo locale', code: 'MODULE_DISABLED' });

    const productIds = [...new Set(items.map(i => i.id).filter(Boolean))];
    const { rows: dbProducts } = await req.db.query(
      'SELECT id, name, price, category, print_destination FROM products WHERE id = ANY($1)', [productIds]
    );
    // Prezzo, nome, categoria e destinazione di stampa vengono dal catalogo, mai dal client
    const productMap = Object.fromEntries(dbProducts.map(p => [p.id, p]));

    // zod garantisce già che id/quantity siano numeri validi nella FORMA;
    // qui verifichiamo solo che il prodotto esista davvero a catalogo.
    for (const item of items) {
      if (!(item.id in productMap))
        return res.status(400).json({ error: `Prodotto non valido: ${item.id}` });
    }

    // Solo admin/responsabile possono inviare righe con omaggio o sconto:
    // per chiunque altro l'adjustment viene ignorato e forzato a 'sale'.
    const authorized = DISCOUNT_ROLES.includes(req.user.role);
    const requestedDiscount = items.some(i => i.type && i.type !== 'sale');
    if (requestedDiscount && !authorized) {
      return res.status(403).json({ error: 'Non hai i permessi per applicare sconti o omaggi.' });
    }

    const verifiedItems = items.map(i => {
      const product = productMap[i.id];
      const original_price = parseFloat(product.price);
      const adjustment = sanitizeAdjustment(i, authorized);
      const line_total = computeLineTotal(original_price, i.quantity, adjustment);
      return {
        id: i.id,
        name: product.name,
        quantity: i.quantity,
        price: line_total / i.quantity, // unitario effettivo; il riferimento è line_total
        line_total,
        original_price,
        type: adjustment.type,
        discountMode: adjustment.discountMode,
        discountValue: adjustment.discountValue,
        note: i.note || '',
        category: product.category || 'Altro',
        print_destination: product.print_destination || 'both',
      };
    });
    const verifiedTotal = verifiedItems.reduce((sum, i) => sum + Math.round(i.line_total * 100), 0) / 100;

    const allGift = verifiedItems.every(i => i.type === 'gift');
    const anyAdjustment = verifiedItems.some(i => i.type !== 'sale');
    const order_type = allGift ? 'gift' : (anyAdjustment ? 'discount' : 'sale');
    const isLateSync = session_id !== undefined;

    try {
      const { order, orderStatus, sessionOpen, stockUpdates } = await inTransaction(req.db, async (db) => {
        const session = await findOrderSession(db, session_id, device_id === undefined);
        const sessionOpen = !session.end_time;
        const displayCode = await resolveDisplayCode(db, session, device_id, device_seq);

        // Comanda su un conto: deve essere aperto e della sessione in corso. Il lock condiviso lascia entrare più
        // comande insieme ma impedisce di annullare o chiudere il conto mentre se ne scrive una.
        if (check_id !== undefined) {
          const { rows: checks } = await db.query('SELECT id, status, session_id FROM checks WHERE id = $1 FOR SHARE', [check_id]);
          if (!checks.length) throw new HttpError(404, 'Conto non trovato');
          if (checks[0].status !== 'open' || checks[0].session_id !== session.id)
            throw new HttpError(409, 'Il conto non è aperto', 'CHECK_CLOSED');
        }
        const totals = sumQuantitiesByProduct(verifiedItems);

        // Un ordine sincronizzato in ritardo è già stato venduto: non si rifiuta per stock.
        if (!isLateSync) {
          const shortages = await lockAndFindShortages(db, totals);
          if (shortages.length) {
            throw new HttpError(409, `Prodotto esaurito o insufficiente: ${shortages.map(p => p.name).join(', ')}`, 'OUT_OF_STOCK');
          }
        }

        // In una sessione già chiusa l'ordine è per forza concluso: entra nel totale
        // di cassa e non finisce in cucina.
        const orderStatus = sessionOpen ? (status || 'pending') : 'completed';
        const createdAt = isLateSync ? clampToSession(client_created_at, session) : null;

        const { rows } = await db.query(
          `INSERT INTO orders (total, status, created_by, order_type, is_takeaway, display_code, session_id, client_order_id, created_at, device_id, device_seq, check_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, now()), $10, $11, $12) RETURNING id, created_at, display_code`,
          [verifiedTotal, orderStatus, req.user.id, order_type, !!is_takeaway,
            displayCode, session.id, client_order_id ?? null, createdAt, device_id ?? null, device_seq ?? null, check_id ?? null]
        );
        // Le righe sono parte dell'ordine: se non si scrivono, l'ordine non nasce (la transazione si annulla).
        await writeOrderItems(db, req.user.tenantId, rows[0].id, verifiedItems);

        // Lo stock riguarda la serata in corso: dopo la chiusura non si tocca più
        // (all'apertura della successiva riparte comunque da disponibilità illimitata).
        // Per una sessione chiusa si aggiorna invece il totale atteso in cassa.
        let stockUpdates = [];
        if (sessionOpen) {
          stockUpdates = await applyStockChange(db, totals, -1);
        } else {
          await db.query('UPDATE sessions SET expected_cash = $1 WHERE id = $2', [await computeExpectedCash(db, session.id), session.id]);
        }
        return { order: rows[0], orderStatus, sessionOpen, stockUpdates };
      });

      await logAudit(req.db, req.user.id, 'CREATE_ORDER', {
        orderId: order.id,
        total: verifiedTotal,
        itemCount: verifiedItems.length,
        ...(check_id !== undefined && { checkId: check_id }),
        ...(isLateSync && { lateSync: true, sessionId: session_id, sessionClosed: !sessionOpen })
      });

      const [withTable] = await withCheckInfo(req.db, [{ check_id }]);
      const orderData = {
        id: order.id,
        check_id: check_id ?? null,
        table_name: withTable.table_name,
        covers: withTable.covers,
        check_number: withTable.check_number,
        display_code: order.display_code,
        status: orderStatus,
        created_at: order.created_at,
        items: verifiedItems,
        total: verifiedTotal,
        is_takeaway: !!is_takeaway
      };

      if (broadcast) {
        stockUpdates.forEach(product => broadcast(req.user.tenantId, { type: 'product_stock_updated', product }));
        if (sessionOpen) broadcast(req.user.tenantId, { type: 'order_created', order: orderData });
        if (check_id !== undefined) broadcast(req.user.tenantId, { type: 'check_updated', check: await getCheckSummary(req.db, check_id) });
      }

      res.json({ success: true, orderId: order.id, displayCode: order.display_code, ...(check_id !== undefined && { checkId: check_id }) });
    } catch (err) {
      // Due invii contemporanei dello stesso ordine: il secondo trova un vincolo di unicità
      // (sulla chiave di idempotenza o sul numero del dispositivo, a seconda di quale scatta prima).
      if (UNIQUE_ORDER_CONSTRAINTS.includes(err.constraint) && client_order_id) {
        const existing = await findOrderByClientId(req.db, client_order_id);
        if (existing) return res.json(duplicateResponse(existing));
      }
      if (err.constraint === 'uniq_orders_device_seq') {
        return res.status(409).json({ error: 'Numero ordine già usato da questo dispositivo', code: 'DEVICE_SEQ_CONFLICT' });
      }
      if (sendHttpError(res, err)) return;
      logger.error({ err }, 'Errore POST /api/orders');
      res.status(500).json({ error: "Errore durante l'invio dell'ordine" });
    }
  });

  // PUT /orders/:id — cambio stato; lo storno ripristina lo stock nella stessa transazione
  router.put('/:id', authenticate, validate({ params: idParamsSchema, body: updateOrderStatusSchema }), tenantScope, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    // La cucina fa avanzare lo stato (in preparazione, completato), ma non storna.
    if (status === 'canceled' && !CASH_ROLES.includes(req.user.role))
      return res.status(403).json({ error: 'Non hai i permessi per stornare ordini' });

    try {
      const { previousStatus, updated, stockUpdates } = await inTransaction(req.db, async (db) => {
        // Per stornare una comanda di un conto si blocca prima il conto, poi la comanda: lo stesso ordine di pagamenti
        // e annullo del conto, così non si incastrano a vicenda.
        if (status === 'canceled') {
          const { rows: pre } = await db.query('SELECT check_id FROM orders WHERE id = $1', [id]);
          if (pre[0]?.check_id) await lockCheck(db, pre[0].check_id, { mustBeOpen: false });
        }
        const { rows: current } = await db.query(
          `SELECT o.status, o.completed_at, o.created_at, o.check_id, c.status AS check_status
           FROM orders o LEFT JOIN checks c ON c.id = o.check_id WHERE o.id = $1 FOR UPDATE OF o`,
          [id]
        );
        if (!current.length) throw new HttpError(404, 'Ordine non trovato');
        const order = current[0];

        const isSimpleModeQuickCancel = status === 'canceled'
          && order.status === 'completed'
          && !order.completed_at
          && (Date.now() - new Date(order.created_at).getTime()) <= CANCEL_WINDOW_MS;
        if (TERMINAL_STATUSES.includes(order.status) && !isSimpleModeQuickCancel) {
          throw new HttpError(409, `Impossibile modificare un ordine in stato "${order.status}"`);
        }

        // Una comanda di un conto già pagato o annullato fa parte dell'incasso: non si storna.
        if (status === 'canceled' && order.check_id) {
          if (order.check_status !== 'open') throw new HttpError(409, 'Il conto è chiuso: la comanda non si può stornare', 'CHECK_CLOSED');
          // Se il conto ha già incassato qualcosa, la comanda non può sparire da sotto i pagamenti.
          await assertOrderCancelable(db, order.check_id, id);
        }

        const { rows } = await db.query(
          `UPDATE orders SET status = $1,
             completed_at = CASE WHEN $1 = 'completed' THEN now() ELSE completed_at END
           WHERE id = $2 RETURNING *`,
          [status, id]
        );
        const [withInfo] = await withCheckInfo(db, [rows[0]]);
        const updated = { ...withInfo, items: (await loadItems(db, [id])).get(id) ?? [] };
        const stockUpdates = status === 'canceled'
          ? await applyStockChange(db, sumQuantitiesByProduct(updated.items.filter(i => i.id !== null)), +1)
          : [];
        return { previousStatus: order.status, updated, stockUpdates };
      });

      await logAudit(req.db, req.user.id, 'UPDATE_ORDER_STATUS', {
        orderId: id,
        oldStatus: previousStatus,
        newStatus: status
      });

      if (broadcast) {
        stockUpdates.forEach(product => broadcast(req.user.tenantId, { type: 'product_stock_updated', product }));
        broadcast(req.user.tenantId, { type: 'order_updated', order: updated });
        if (updated.check_id) broadcast(req.user.tenantId, { type: 'check_updated', check: await getCheckSummary(req.db, updated.check_id) });
      }
      res.json(updated);
    } catch (err) {
      if (sendHttpError(res, err)) return;
      logger.error({ err }, 'Errore PUT /api/orders/:id');
      res.status(500).json({ error: 'Errore aggiornamento ordine' });
    }
  });

  // POST /orders/reprints — ristampe fatte offline: la cassa le comunica al ritorno della rete.
  // Il 404 (ordine non ancora sincronizzato) è temporaneo: la cassa riprova dopo.
  router.post('/reprints', authenticate, authorizeCash, validate({ body: reprintAuditSchema }), tenantScope, async (req, res) => {
    const { client_order_id, reprinted_at } = req.body;
    try {
      const order = await findOrderByClientId(req.db, client_order_id);
      if (!order) return res.status(404).json({ error: 'Ordine non ancora sincronizzato', code: 'ORDER_NOT_SYNCED' });
      for (const at of reprinted_at) {
        await logAudit(req.db, req.user.id, 'REPRINT_ORDER', { orderId: order.id, offline: true, reprintedAt: at });
      }
      res.json({ success: true });
    } catch (err) {
      logger.error({ err }, 'Errore registrazione ristampe offline');
      res.status(500).json({ error: 'Errore registrazione ristampe' });
    }
  });

  // POST /orders/:id/reprint — la stampa è del client: qui si registra l'azione (audit)
  // e si restituisce l'ordine com'è stato salvato, da cui la cassa ricostruisce le copie.
  router.post('/:id/reprint', authenticate, authorizeCash, validate({ params: idParamsSchema }), tenantScope, async (req, res) => {
    try {
      const { rows } = await req.db.query(
        'SELECT id, display_code, created_at, total, is_takeaway, check_id FROM orders WHERE id = $1', [req.params.id]);
      if (!rows.length) return res.status(404).json({ error: 'Ordine non trovato' });
      const [order] = await withCheckInfo(req.db, await withItems(req.db, rows));

      await logAudit(req.db, req.user.id, 'REPRINT_ORDER', { orderId: order.id });
      res.json({ ...order, total: parseFloat(order.total) });
    } catch (err) {
      logger.error({ err }, 'Errore ristampa');
      res.status(500).json({ error: 'Errore durante la ristampa' });
    }
  });

  // GET /orders/kds — tenant risolto dal sottodominio
  router.get('/kds', resolveTenantFromHost, requireModule('kds'), async (req, res) => {
    try {
      const data = await withTenantClient(req.tenantId, async (db) => {
        const { rows } = await db.query(
          `SELECT o.id, o.display_code, o.status, o.is_takeaway, o.created_at, o.check_id
           FROM orders o JOIN sessions s ON s.id = o.session_id AND s.end_time IS NULL
           WHERE o.status IN ('pending', 'preparing') ORDER BY o.created_at DESC`
        );
        return (await withCheckInfo(db, await withItems(db, rows))).map(toPublicOrder);
      });
      res.json(data);
    } catch (err) {
      logger.error({ err }, 'Errore GET /api/orders/kds');
      res.status(500).json({ error: 'Errore recupero ordini KDS' });
    }
  });

  return router;
}