import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../db.js';
import { authenticate, DISCOUNT_ROLES } from '../middleware/authenticate.js';
import { tenantScope, withTenantClient } from '../middleware/tenantScope.js';
import { resolveTenantFromHost } from '../middleware/resolveTenantFromHost.js';
import { printOrderBatch } from '../utils/receiptTemplates.js';
import { computeEffectivePrice, sanitizeAdjustment } from '../utils/pricing.js';
import logger from '../logger.js';
import { logAudit } from '../utils/auditLogger.js';
import { createOrderSchema } from '../schemas/orderSchema.js';
import { toPublicOrder } from '../utils/publicOrder.js';

const router = express.Router();
const TMP_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'tmp');
fs.mkdirSync(TMP_DIR, { recursive: true });

function safeParseJSON(value, fallback = []) {
  try { return Array.isArray(value) ? value : JSON.parse(value || '[]'); }
  catch { return fallback; }
}

const TERMINAL_STATUSES = ['canceled', 'completed'];

// Helper PULITO: Calcola unicamente il PROSSIMO codice progressivo (es. A1, A100, B1) per un nuovo ordine
async function getNextDisplayCode(db) {
  try {
    // 1. Troviamo l'inizio della sessione attiva
    const { rows: sessions } = await db.query(
      'SELECT start_time FROM sessions WHERE end_time IS NULL ORDER BY start_time DESC LIMIT 1'
    );

    let startTime = new Date();
    if (sessions.length > 0) {
      startTime = sessions[0].start_time;
    }

    // 2. Contiamo basandoci sull'id sequenziale (evita bug di millisecondi identici)
    const { rows: countRows } = await db.query(
      'SELECT COUNT(*)::int as count FROM orders WHERE created_at >= $1',
      [startTime]
    );

    const positionInSession = (countRows[0].count || 0) + 1;

    // 3. Calcolo della lettera (0 = A, 1 = B, etc.) basandoci sui blocchi da 100
    const letterIndex = Math.floor((positionInSession - 1) / 100);
    // Converte l'indice in lettera ASCII (65 è il codice di 'A')
    const letter = String.fromCharCode(65 + (letterIndex % 26));
    // 4. Calcolo del numero da 1 a 100
    const number = ((positionInSession - 1) % 100) + 1;

    // Ritorna la stringa combinata (es. "A1", "A100", "B1")
    return `${letter}${number}`;
  } catch (err) {
    logger.error({ err }, "Errore nel calcolo del prossimo display_code. Fallback ad A1.");
    return `A1`;
  }
}

// Stampa: usa semplicemente il display_code già salvato nel DB
async function printOrder(db, orderData, sessionName) {
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
      let params = [];
      if (req.query.session === 'active') {
        const { rows: sessions } = await req.db.query(
          'SELECT start_time, end_time FROM sessions WHERE end_time IS NULL ORDER BY start_time DESC LIMIT 1'
        );
        if (!sessions.length) return res.json([]);
        const { start_time, end_time } = sessions[0];
        query = `SELECT * FROM orders WHERE created_at >= $1 ${end_time ? 'AND created_at <= $2' : ''} ORDER BY created_at DESC`;
        params = end_time ? [start_time, end_time] : [start_time];
      }
      const { rows } = await req.db.query(query, params);

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
      if (!priceMap[item.id])
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

    // Verifica stock prima di aprire la transazione
    const stockChecks = await req.db.query(
      'SELECT id, name, stock, stock_enabled FROM products WHERE id = ANY($1) AND stock_enabled = true',
      [productIds]
    );
    for (const p of stockChecks.rows) {
      const needed = verifiedItems.find(i => i.id === p.id)?.quantity || 0;
      if (p.stock !== null && p.stock < needed)
        return res.status(409).json({ error: `Prodotto esaurito: ${p.name}` });
    }

    const client = req.db;
    try {
      await client.query('BEGIN');
      const allGift = verifiedItems.every(i => i.type === 'gift');
      const anyAdjustment = verifiedItems.some(i => i.type !== 'sale');
      const order_type = allGift ? 'gift' : (anyAdjustment ? 'discount' : 'sale');

      // 1. UNICO CALCOLO: Generiamo il codice progressivo per il nuovo ordine
      const nextDisplayCode = await getNextDisplayCode(client);

      // 2. SALVATAGGIO: Salva display_code direttamente nel DB
      const { rows } = await client.query(
        'INSERT INTO orders (items, total, status, created_by, order_type, is_takeaway, display_code) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, created_at, display_code',
        [JSON.stringify(verifiedItems), verifiedTotal, status || 'pending', req.user.id, order_type, !!is_takeaway, nextDisplayCode]
      );
      
      const orderId = rows[0].id;
      const timestamp = rows[0].created_at;
      const savedDisplayCode = rows[0].display_code;

      // Scala stock
      for (const p of stockChecks.rows) {
        const needed = verifiedItems.find(i => i.id === p.id)?.quantity || 0;
        const newStock = Math.max(0, (p.stock || 0) - needed);

        await client.query(
          'UPDATE products SET stock = $1, visible = CASE WHEN $1 = 0 THEN false ELSE visible END WHERE id = $2',
          [newStock, p.id]
        );

        // FIX: Ora inviamo sempre l'aggiornamento, non solo quando arriva a 0
        if (broadcast) {
          broadcast(req.user.tenantId, {
            type: 'product_stock_updated',
            product: { id: p.id, stock: newStock, visible: newStock > 0 ? p.visible : false }
          });
        }
      }

      await client.query('COMMIT');

      await logAudit(req.user.id, 'CREATE_ORDER', {
        orderId,
        total: verifiedTotal,
        itemCount: verifiedItems.length
      });

      const { rows: sessionRows } = await req.db.query(
        'SELECT name FROM sessions WHERE end_time IS NULL ORDER BY start_time DESC LIMIT 1'
      );

      const orderData = { 
        id: orderId, 
        display_code: savedDisplayCode, 
        created_at: timestamp, 
        items: verifiedItems, 
        total: verifiedTotal, 
        is_takeaway: !!is_takeaway 
      };

      if (broadcast) {
        broadcast(req.user.tenantId, {
          type: 'order_created',
          order: {
            id: orderId,
            display_code: savedDisplayCode,
            items: verifiedItems,
            total: verifiedTotal,
            status: status || 'pending',
            created_at: timestamp,
            is_takeaway: !!is_takeaway
          }
        });
      }

      res.json({ success: true, orderId, displayCode: savedDisplayCode });

      // Fire-and-forget: gira DOPO la risposta, quindi req.db è già stato
      // rilasciato al pool. Serve una connessione scoped indipendente.
      withTenantClient(req.user.tenantId, (db) =>
        printOrder(db, orderData, sessionRows[0]?.name || 'Serata')
      ).catch(err => logger.error({ err }, 'Errore printOrder'));

    } catch (err) {
      await client.query('ROLLBACK');
      logger.error({ err }, 'Errore POST /api/orders')
      res.status(500).json({ error: "Errore durante l'invio dell'ordine" });
    }
  });

  // PUT /orders/:id
  router.put('/:id', authenticate, tenantScope, async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const { rows: current } = await req.db.query('SELECT status, completed_at, created_at FROM orders WHERE id=$1', [id]);
      if (!current.length) return res.status(404).json({ error: 'Ordine non trovato' });

      const CANCEL_WINDOW_MS = 5 * 60 * 1000;
      // Ordini modalità "semplice": nascono già come 'completed' ma senza completed_at
      // (valorizzato solo dal flusso cucina). Per questi si può ancora stornare entro 5 minuti.
      const isSimpleModeQuickCancel = status === 'canceled'
        && current[0].status === 'completed'
        && !current[0].completed_at
        && (Date.now() - new Date(current[0].created_at).getTime()) <= CANCEL_WINDOW_MS;

      if (TERMINAL_STATUSES.includes(current[0].status) && !isSimpleModeQuickCancel)
        return res.status(409).json({ error: `Impossibile modificare un ordine in stato "${current[0].status}"` });

      const completedAt = status === 'completed' ? new Date().toISOString() : null;
      const { rows } = await req.db.query(
        `UPDATE orders SET status=$1 ${completedAt ? ', completed_at=$3' : ''} WHERE id=$2 RETURNING *`,
        completedAt ? [status, id, completedAt] : [status, id]
      );
      const updated = { ...rows[0], items: safeParseJSON(rows[0].items) };

      // Storno: ripristina lo stock dei prodotti scalato alla creazione dell'ordine
      if (status === 'canceled') {
        const productIds = updated.items.map(i => i.id);
        if (productIds.length) {
          const { rows: stockProducts } = await req.db.query(
            'SELECT id, stock, visible FROM products WHERE id = ANY($1) AND stock_enabled = true',
            [productIds]
          );
          for (const p of stockProducts) {
            const restored = updated.items.find(i => i.id === p.id)?.quantity || 0;
            if (!restored) continue;
            const newStock = (p.stock || 0) + restored;
            await req.db.query(
              'UPDATE products SET stock = $1, visible = CASE WHEN visible = false AND $1 > 0 THEN true ELSE visible END WHERE id = $2',
              [newStock, p.id]
            );
            if (broadcast) {
              broadcast(req.user.tenantId, { type: 'product_stock_updated', product: { id: p.id, stock: newStock, visible: true } });
            }
          }
        }
      }

      await logAudit(req.user.id, 'UPDATE_ORDER_STATUS', {
        orderId: id,
        oldStatus: current[0].status,
        newStatus: status
      });

      if (broadcast) broadcast(req.user.tenantId, { type: 'order_updated', order: updated });
      res.json(updated);
    } catch (err) {
      logger.error({ err }, 'Errore PUT /api/orders/:id:')
      res.status(500).json({ error: 'Errore aggiornamento ordine' });
    }
  });

  // POST /orders/:id/reprint
  router.post('/:id/reprint', authenticate, tenantScope, async (req, res) => {
    try {
      const { rows } = await req.db.query('SELECT * FROM orders WHERE id=$1', [req.params.id]);
      if (!rows.length) return res.status(404).json({ error: 'Ordine non trovato' });
      const order = rows[0];

      await logAudit(req.user.id, 'REPRINT_ORDER', { orderId: req.params.id });

      const { rows: sessionRows } = await req.db.query(
        'SELECT name FROM sessions WHERE end_time IS NULL ORDER BY start_time DESC LIMIT 1'
      );
      await printOrder(
        req.db,
        { id: order.id, display_code: order.display_code, created_at: order.created_at, items: safeParseJSON(order.items), total: parseFloat(order.total) },
        sessionRows[0]?.name || 'Serata'
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
        const { rows: sessions } = await db.query(
          'SELECT start_time FROM sessions WHERE end_time IS NULL ORDER BY start_time DESC LIMIT 1'
        );
        if (!sessions.length) return [];
        const { rows } = await db.query(
          `SELECT id, display_code, status, is_takeaway, created_at, items
           FROM orders WHERE status IN ('pending','preparing') AND created_at >= $1 ORDER BY created_at DESC`,
          [sessions[0].start_time]
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