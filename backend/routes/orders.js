import express from 'express';
import { inTransaction } from '../db.js';
import { authenticate, authorizeCash, CASH_ROLES, DISCOUNT_ROLES } from '../middleware/authenticate.js';
import { tenantScope, withTenantClient } from '../middleware/tenantScope.js';
import { resolveTenantFromHost } from '../middleware/resolveTenantFromHost.js';
import { computeLineTotal, sanitizeAdjustment } from '../utils/pricing.js';
import logger from '../logger.js';
import { logAudit } from '../utils/auditLogger.js';
import { createOrderSchema, updateOrderStatusSchema, reprintAuditSchema } from '../schemas/orderSchema.js';
import { idParamsSchema } from '../schemas/common.js';
import { validate } from '../middleware/validate.js';
import { toPublicOrder } from '../utils/publicOrder.js';
import { formatDisplayCode, formatDeviceCode } from '../utils/displayCode.js';
import { sumQuantitiesByProduct, lockAndFindShortages, applyStockChange } from '../utils/stock.js';
import { HttpError, sendHttpError } from '../utils/httpError.js';
import { computeExpectedCash, clampToSession } from '../utils/session.js';

const router = express.Router();

function safeParseJSON(value, fallback = []) {
  try { return Array.isArray(value) ? value : JSON.parse(value || '[]'); }
  catch { return fallback; }
}

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

  // GET /orders
  router.get('/', authenticate, tenantScope, async (req, res) => {
    try {
      let query = 'SELECT * FROM orders ORDER BY created_at DESC';
      if (req.query.session === 'active') {
        query = `SELECT o.* FROM orders o
                 JOIN sessions s ON s.id = o.session_id AND s.end_time IS NULL
                 ORDER BY o.created_at DESC`;
      }
      const { rows } = await req.db.query(query);

      // 🚀 FIX CRITICO: Recuperiamo la mappatura attuale dei prodotti dal DB per associare le categorie
      const { rows: dbProducts } = await req.db.query('SELECT id, category FROM products');
      const categoryMap = Object.fromEntries(dbProducts.map(p => [p.id, p.category || 'Altro']));

      // Rispediamo i dati mappandoli in modo che ogni item abbia la sua categoria reale
      const mappedRows = rows.map(o => {
        const parsedItems = safeParseJSON(o.items).map(i => ({
          ...i,
          note: i.note || '',
          // Se l'item non ha la categoria nel JSON, la prendiamo dalla mappa aggiornata tramite l'ID prodotto
          category: i.category || categoryMap[i.id] || 'Altro'
        }));
        return { ...o, items: parsedItems };
      });

      res.json(mappedRows);
    } catch (err) {
      logger.error({ err }, 'Errore GET /api/orders:')
      res.status(500).json({ error: 'Errore nel recupero degli ordini' });
    }
  });

  // POST /orders (Creazione Ordine)
  router.post('/', authenticate, authorizeCash, validate({ body: createOrderSchema }), tenantScope, async (req, res) => {
    const { items, status, is_takeaway, client_order_id, session_id, client_created_at, device_id, device_seq } = req.body;

    // Idempotenza: un ordine già ricevuto (retry dopo un errore di rete o dalla
    // coda offline) non si duplica, si risponde con quello esistente.
    if (client_order_id) {
      const existing = await findOrderByClientId(req.db, client_order_id);
      if (existing) return res.json(duplicateResponse(existing));
    }

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
          `INSERT INTO orders (items, total, status, created_by, order_type, is_takeaway, display_code, session_id, client_order_id, created_at, device_id, device_seq)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10, now()), $11, $12) RETURNING id, created_at, display_code`,
          [JSON.stringify(verifiedItems), verifiedTotal, orderStatus, req.user.id, order_type, !!is_takeaway,
            displayCode, session.id, client_order_id ?? null, createdAt, device_id ?? null, device_seq ?? null]
        );

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
        ...(isLateSync && { lateSync: true, sessionId: session_id, sessionClosed: !sessionOpen })
      });

      const orderData = {
        id: order.id,
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
      }

      res.json({ success: true, orderId: order.id, displayCode: order.display_code });
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
        const { rows: current } = await db.query(
          'SELECT status, completed_at, created_at FROM orders WHERE id = $1 FOR UPDATE',
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

        const { rows } = await db.query(
          `UPDATE orders SET status = $1,
             completed_at = CASE WHEN $1 = 'completed' THEN now() ELSE completed_at END
           WHERE id = $2 RETURNING *`,
          [status, id]
        );
        const updated = { ...rows[0], items: safeParseJSON(rows[0].items) };
        const stockUpdates = status === 'canceled'
          ? await applyStockChange(db, sumQuantitiesByProduct(updated.items), +1)
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
        'SELECT id, display_code, created_at, items, total, is_takeaway FROM orders WHERE id = $1', [req.params.id]);
      if (!rows.length) return res.status(404).json({ error: 'Ordine non trovato' });
      const order = rows[0];

      await logAudit(req.db, req.user.id, 'REPRINT_ORDER', { orderId: order.id });
      res.json({ ...order, items: safeParseJSON(order.items), total: parseFloat(order.total) });
    } catch (err) {
      logger.error({ err }, 'Errore ristampa');
      res.status(500).json({ error: 'Errore durante la ristampa' });
    }
  });

  // GET /orders/kds — tenant risolto dal sottodominio
  router.get('/kds', resolveTenantFromHost, async (req, res) => {
    try {
      const data = await withTenantClient(req.tenantId, async (db) => {
        const { rows } = await db.query(
          `SELECT o.id, o.display_code, o.status, o.is_takeaway, o.created_at, o.items
           FROM orders o JOIN sessions s ON s.id = o.session_id AND s.end_time IS NULL
           WHERE o.status IN ('pending', 'preparing') ORDER BY o.created_at DESC`
        );
        return rows.map(o => toPublicOrder({ ...o, items: safeParseJSON(o.items) }));
      });
      res.json(data);
    } catch (err) {
      logger.error({ err }, 'Errore GET /api/orders/kds');
      res.status(500).json({ error: 'Errore recupero ordini KDS' });
    }
  });

  return router;
}