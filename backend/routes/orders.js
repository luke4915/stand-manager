import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { inTransaction } from '../db.js';
import { authenticate, DISCOUNT_ROLES } from '../middleware/authenticate.js';
import { tenantScope, withTenantClient } from '../middleware/tenantScope.js';
import { resolveTenantFromHost } from '../middleware/resolveTenantFromHost.js';
import { printOrderBatch } from '../utils/receiptTemplates.js';
import { computeEffectivePrice, sanitizeAdjustment } from '../utils/pricing.js';
import logger from '../logger.js';
import { logAudit } from '../utils/auditLogger.js';
import { createOrderSchema, orderIdSchema, updateOrderStatusSchema } from '../schemas/orderSchema.js';
import { toPublicOrder } from '../utils/publicOrder.js';
import { formatDisplayCode } from '../utils/displayCode.js';
import { sumQuantitiesByProduct, lockAndFindShortages, applyStockChange } from '../utils/stock.js';
import { HttpError, sendHttpError } from '../utils/httpError.js';

const router = express.Router();

function safeParseJSON(value, fallback = []) {
  try { return Array.isArray(value) ? value : JSON.parse(value || '[]'); }
  catch { return fallback; }
}

const TERMINAL_STATUSES = ['canceled', 'completed'];

// Ordini modalità "semplice": nascono già 'completed' ma senza completed_at
// (valorizzato solo dal flusso cucina). Per questi lo storno è ammesso entro 5 minuti.
const CANCEL_WINDOW_MS = 5 * 60 * 1000;

// Stampa: usa semplicemente il display_code già salvato nel DB
async function printOrder(db, orderData) {
  const { rows: settings } = await db.query(
    `SELECT ps.printer_type, ps.printer_address, ct.name AS copy_type
     FROM print_settings ps
     JOIN copy_types ct ON ct.id = ps.copy_type_id
     WHERE ps.enabled = true
     ORDER BY ps.sort_order ASC, ct.id ASC`
  );
  if (!settings.length) return;

  const productIds = [...new Set(orderData.items.map(i => i.id).filter(Boolean))];
  const destMap = {};
  if (productIds.length) {
    const { rows: products } = await db.query(
      'SELECT id, print_destination FROM products WHERE id = ANY($1)',
      [productIds]
    );
    products.forEach(p => { destMap[p.id] = p.print_destination || 'both'; });
  }

  const logoPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'logo_5calzoni.png');

  // Legge il codice salvato sul DB (o usa l'ID di fallback)
  const displayCode = orderData.display_code || `A${orderData.id}`;

  const enrichedOrder = {
    ...orderData,
    id: displayCode,
    realDbId: orderData.id,
    items: orderData.items.map(i => ({ ...i, print_destination: destMap[i.id] || 'both' })),
  };

  logger.info(`[ROUTER ORDERS] Avvio batch stampa: ${settings.map(s => s.copy_type).join(', ')} su ${settings[0]?.printer_address}`);

  try {
    await printOrderBatch(settings, enrichedOrder, logoPath);
    logger.info(`[ROUTER ORDERS] Batch stampa completato`);
  } catch (err) {
    logger.error({ err }, `Errore batch stampa: ${err.message}`);
  }
}

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
  router.post('/', authenticate, tenantScope, async (req, res) => {
    const parsed = createOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Richiesta non valida', details: parsed.error.flatten() });
    }
    const { items, status, is_takeaway } = parsed.data;

    const productIds = [...new Set(items.map(i => i.id).filter(Boolean))];
    const { rows: dbProducts } = await req.db.query(
      'SELECT id, price FROM products WHERE id = ANY($1)', [productIds]
    );
    const priceMap = Object.fromEntries(dbProducts.map(p => [p.id, parseFloat(p.price)]));

    // zod garantisce già che id/quantity siano numeri validi nella FORMA;
    // qui verifichiamo solo che il prodotto esista davvero a catalogo.
    for (const item of items) {
      if (!(item.id in priceMap))
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
      const original_price = priceMap[i.id];
      const adjustment = sanitizeAdjustment(i, authorized);
      const price = computeEffectivePrice(original_price, adjustment);
      return {
        id: i.id,
        name: i.name,
        quantity: i.quantity,
        price,
        original_price,
        type: adjustment.type,
        discountMode: adjustment.discountMode,
        discountValue: adjustment.discountValue,
        note: i.note || '',
        category: i.category,
        print_destination: i.print_destination || 'both',
      };
    });
    const verifiedTotal = verifiedItems.reduce((sum, i) => sum + i.price * i.quantity, 0);

    const allGift = verifiedItems.every(i => i.type === 'gift');
    const anyAdjustment = verifiedItems.some(i => i.type !== 'sale');
    const order_type = allGift ? 'gift' : (anyAdjustment ? 'discount' : 'sale');
    const orderStatus = status || 'pending';

    try {
      const { order, stockUpdates } = await inTransaction(req.db, async (db) => {
        // Il contatore della sessione aperta fa da lucchetto: gli ordini concorrenti
        // dello stesso tenant si mettono in fila qui e ricevono codici distinti.
        const { rows: sessionRows } = await db.query(
          `UPDATE sessions SET order_counter = order_counter + 1
           WHERE end_time IS NULL RETURNING id, order_counter`
        );
        if (!sessionRows.length) {
          throw new HttpError(409, 'Nessuna sessione attiva: apri una sessione prima di inviare ordini', 'NO_ACTIVE_SESSION');
        }
        const session = sessionRows[0];

        const totals = sumQuantitiesByProduct(verifiedItems);
        const shortages = await lockAndFindShortages(db, totals);
        if (shortages.length) {
          throw new HttpError(409, `Prodotto esaurito o insufficiente: ${shortages.map(p => p.name).join(', ')}`, 'OUT_OF_STOCK');
        }

        const { rows } = await db.query(
          `INSERT INTO orders (items, total, status, created_by, order_type, is_takeaway, display_code, session_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, created_at, display_code`,
          [JSON.stringify(verifiedItems), verifiedTotal, orderStatus, req.user.id, order_type, !!is_takeaway,
            formatDisplayCode(session.order_counter), session.id]
        );
        return { order: rows[0], stockUpdates: await applyStockChange(db, totals, -1) };
      });

      await logAudit(req.db, req.user.id, 'CREATE_ORDER', {
        orderId: order.id,
        total: verifiedTotal,
        itemCount: verifiedItems.length
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
        broadcast(req.user.tenantId, { type: 'order_created', order: orderData });
      }

      res.json({ success: true, orderId: order.id, displayCode: order.display_code });

      // Fire-and-forget: gira DOPO la risposta, quindi req.db è già stato
      // rilasciato al pool. Serve una connessione scoped indipendente.
      withTenantClient(req.user.tenantId, (db) => printOrder(db, orderData))
        .catch(err => logger.error({ err }, 'Errore printOrder'));
    } catch (err) {
      if (sendHttpError(res, err)) return;
      logger.error({ err }, 'Errore POST /api/orders');
      res.status(500).json({ error: "Errore durante l'invio dell'ordine" });
    }
  });

  // PUT /orders/:id — cambio stato; lo storno ripristina lo stock nella stessa transazione
  router.put('/:id', authenticate, tenantScope, async (req, res) => {
    const id = orderIdSchema.safeParse(req.params.id);
    const body = updateOrderStatusSchema.safeParse(req.body);
    if (!id.success || !body.success) return res.status(400).json({ error: 'Richiesta non valida' });
    const { status } = body.data;

    try {
      const { previousStatus, updated, stockUpdates } = await inTransaction(req.db, async (db) => {
        const { rows: current } = await db.query(
          'SELECT status, completed_at, created_at FROM orders WHERE id = $1 FOR UPDATE',
          [id.data]
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
          [status, id.data]
        );
        const updated = { ...rows[0], items: safeParseJSON(rows[0].items) };
        const stockUpdates = status === 'canceled'
          ? await applyStockChange(db, sumQuantitiesByProduct(updated.items), +1)
          : [];
        return { previousStatus: order.status, updated, stockUpdates };
      });

      await logAudit(req.db, req.user.id, 'UPDATE_ORDER_STATUS', {
        orderId: id.data,
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

  // POST /orders/:id/reprint
  router.post('/:id/reprint', authenticate, tenantScope, async (req, res) => {
    try {
      const { rows } = await req.db.query('SELECT * FROM orders WHERE id=$1', [req.params.id]);
      if (!rows.length) return res.status(404).json({ error: 'Ordine non trovato' });
      const order = rows[0];

      await logAudit(req.db, req.user.id, 'REPRINT_ORDER', { orderId: req.params.id });

      await printOrder(
        req.db,
        { id: order.id, display_code: order.display_code, created_at: order.created_at, items: safeParseJSON(order.items), total: parseFloat(order.total) }
      );
      res.json({ success: true });
    } catch (err) {
      logger.error({ err }, 'Errore ristampa')
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