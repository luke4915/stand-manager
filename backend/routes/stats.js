import express from 'express';
import { authenticate, authorizeRoles } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';
import { tenantScope } from '../middleware/tenantScope.js';
import logger from '../logger.js';
import { statsQuerySchema, sharedProductsQuerySchema, headToHeadQuerySchema } from '../schemas/statsSchema.js';
import { requireModule } from '../utils/tenantModules.js';
import { COMPLETED_ITEMS, LINE_REVENUE } from '../utils/statsSql.js';
import { isRevenue, isKitchenOrder } from '../utils/revenue.js';
import { buildStats } from '../utils/stats.js';
import { buildRestaurantStats } from '../utils/restaurantStats.js';

const router = express.Router();

const authorizeStats = authorizeRoles(['admin', 'responsabile'], 'Le statistiche sono riservate ad admin e responsabili');

// GET /api/stats?sessions=1,2&tz=Europe/Rome — statistiche aggregate dal database (nessun ordine viaggia verso il browser).
// Senza `sessions` valgono tutte le serate. Le ore sono nel fuso `tz` del dispositivo.
router.get('/', authenticate, requireModule('stats'), authorizeStats, validate({ query: statsQuerySchema }), tenantScope, async (req, res) => {
  const { sessions, tz } = req.validQuery;
  const sessionFilter = sessions?.length ? sessions : null;
  const inSessions = 'AND ($1::int[] IS NULL OR o.session_id = ANY($1))';
  try {
    const [totals, canceled, byHour, products] = await Promise.all([
      req.db.query(
        `SELECT COUNT(*) FILTER (WHERE ${isKitchenOrder('o')})::int AS n, COALESCE(SUM(o.total), 0) AS total,
                COUNT(*) FILTER (WHERE o.is_takeaway)::int AS takeaway,
                AVG(EXTRACT(EPOCH FROM (o.completed_at - o.created_at)) / 60)
                  FILTER (WHERE ${isKitchenOrder('o')} AND o.completed_at >= o.created_at AND o.completed_at - o.created_at < interval '180 minutes') AS avg_minutes
         FROM orders o WHERE ${isRevenue('o')} ${inSessions}`, [sessionFilter]),
      req.db.query(
        `SELECT COUNT(*)::int AS n, COALESCE(SUM(o.total), 0) AS total
         FROM orders o WHERE o.status = 'canceled' AND ${isKitchenOrder('o')} ${inSessions}`, [sessionFilter]),
      req.db.query(
        `SELECT EXTRACT(hour FROM o.created_at AT TIME ZONE $2)::int AS hour, COUNT(*) FILTER (WHERE ${isKitchenOrder('o')})::int AS n, SUM(o.total) AS total,
                AVG(EXTRACT(EPOCH FROM (o.completed_at - o.created_at)) / 60)
                  FILTER (WHERE ${isKitchenOrder('o')} AND o.completed_at >= o.created_at AND o.completed_at - o.created_at < interval '180 minutes') AS avg_minutes,
                COUNT(*) FILTER (WHERE ${isKitchenOrder('o')} AND o.completed_at >= o.created_at AND o.completed_at - o.created_at < interval '180 minutes')::int AS n_minutes
         FROM orders o WHERE ${isRevenue('o')} ${inSessions}
         GROUP BY 1`, [sessionFilter, tz]),
      // Per id di prodotto, non per nome: un prodotto rinominato resta uno solo.
      // Il mancato incasso degli omaggi usa il prezzo di listino salvato nell'ordine (original_price).
      req.db.query(
        `SELECT i.product_id,
                COALESCE(p.name, MAX(i.name)) AS name,
                COALESCE(MAX(i.category), MAX(p.category), 'Altro') AS category,
                SUM(i.quantity) AS quantity,
                SUM(${LINE_REVENUE}) AS revenue,
                SUM(CASE WHEN ${LINE_REVENUE} = 0
                         THEN COALESCE(i.original_price, p.price, 0) * i.quantity ELSE 0 END) AS missed
         ${COMPLETED_ITEMS} ${inSessions}
         GROUP BY i.product_id, p.name`, [sessionFilter]),
    ]);
    res.json(buildStats({ totals: totals.rows[0], canceled: canceled.rows[0], byHour: byHour.rows, products: products.rows }));
  } catch (err) {
    logger.error({ err }, 'Errore GET /api/stats');
    res.status(500).json({ error: 'Errore nel calcolo delle statistiche' });
  }
});

// GET /api/stats/restaurant?sessions=1,2&tz=Europe/Rome — statistiche del ristorante: coperti, scontrino medio per coperto,
// durata e rotazione dei conti, andamento per ora, portate, piatti, tempi di cucina, sconti, incassi per metodo.
// Tutto aggregato dal database. Gli importi vengono dalle comande dei conti pagati (`isRevenue`), come le altre statistiche.
router.get('/restaurant', authenticate, requireModule('stats'), requireModule('tables'), authorizeStats, validate({ query: statsQuerySchema }), tenantScope, async (req, res) => {
  const { sessions, tz } = req.validQuery;
  const sf = sessions?.length ? sessions : null;
  const inSessions = 'AND ($1::int[] IS NULL OR o.session_id = ANY($1))';
  const checkSessions = 'AND ($1::int[] IS NULL OR c.session_id = ANY($1))';
  const revenueOrders = `${isRevenue('o')} AND ${isKitchenOrder('o')}`;
  try {
    const [checks, revenue, byHour, courses, products, kitchen, discounts, payments] = await Promise.all([
      req.db.query(
        `SELECT COUNT(*)::int AS n, COALESCE(SUM(c.covers), 0)::int AS covers, COUNT(DISTINCT c.table_id)::int AS tables,
                AVG(EXTRACT(EPOCH FROM (c.closed_at - c.opened_at)) / 60) FILTER (WHERE c.closed_at - c.opened_at < interval '6 hours') AS avg_minutes
         FROM checks c WHERE c.status = 'paid' ${checkSessions}`, [sf]),
      req.db.query(`SELECT COALESCE(SUM(o.total), 0) AS total FROM orders o WHERE ${isRevenue('o')} ${inSessions}`, [sf]),
      req.db.query(
        `SELECT EXTRACT(hour FROM c.opened_at AT TIME ZONE $2)::int AS hour, COUNT(*)::int AS n, SUM(c.covers)::int AS covers,
                SUM((SELECT COALESCE(SUM(o.total), 0) FROM orders o WHERE o.check_id = c.id AND o.status <> 'canceled')) AS revenue
         FROM checks c WHERE c.status = 'paid' ${checkSessions} GROUP BY 1`, [sf, tz]),
      req.db.query(
        `SELECT COALESCE(o.course_name, 'Senza portata') AS course, SUM(i.quantity) AS quantity, SUM(${LINE_REVENUE}) AS revenue
         ${COMPLETED_ITEMS} AND ${isKitchenOrder('o')} ${inSessions} GROUP BY 1`, [sf]),
      req.db.query(
        `SELECT i.product_id, COALESCE(p.name, MAX(i.name)) AS name, SUM(i.quantity) AS quantity, SUM(${LINE_REVENUE}) AS revenue
         ${COMPLETED_ITEMS} AND ${isKitchenOrder('o')} ${inSessions} GROUP BY i.product_id, p.name`, [sf]),
      // Da quando la comanda esce a quando la riga è pronta, per postazione; solo righe che hanno fatto il giro vero
      req.db.query(
        `SELECT CASE WHEN i.print_destination = 'bar' THEN 'bar' ELSE 'kitchen' END AS station,
                AVG(EXTRACT(EPOCH FROM (i.ready_at - o.fired_at)) / 60) AS avg_minutes, COUNT(*)::int AS n
         FROM order_items i JOIN orders o ON o.id = i.order_id
         WHERE o.check_id IS NOT NULL AND o.status <> 'canceled' AND ${isKitchenOrder('o')}
           AND o.fired_at IS NOT NULL AND i.ready_at IS NOT NULL AND i.ready_at >= o.fired_at AND i.ready_at - o.fired_at < interval '120 minutes' ${inSessions}
         GROUP BY 1`, [sf]),
      req.db.query(
        `SELECT COALESCE(SUM(CASE WHEN i.line_type = 'discount' THEN COALESCE(i.original_price, 0) * i.quantity - i.line_total ELSE 0 END), 0) AS discount,
                COALESCE(SUM(CASE WHEN i.line_type = 'gift' THEN COALESCE(i.original_price, 0) * i.quantity ELSE 0 END), 0) AS gift,
                COUNT(*)::int AS lines
         FROM orders o JOIN order_items i ON i.order_id = o.id
         WHERE ${revenueOrders} AND i.line_type <> 'sale' ${inSessions}`, [sf]),
      req.db.query(
        `SELECT p.method, SUM(p.amount) AS amount FROM payments p JOIN checks c ON c.id = p.check_id
         WHERE c.status = 'paid' ${checkSessions} GROUP BY p.method`, [sf]),
    ]);
    res.json(buildRestaurantStats({
      checks: checks.rows[0], revenue: revenue.rows[0].total, byHour: byHour.rows, courses: courses.rows, products: products.rows,
      kitchen: kitchen.rows, discounts: discounts.rows[0], payments: payments.rows,
    }));
  } catch (err) {
    logger.error({ err }, 'Errore GET /api/stats/restaurant');
    res.status(500).json({ error: 'Errore nel calcolo delle statistiche' });
  }
});

// GET /api/stats/shared-products?a=1&b=2 — prodotti venduti in entrambe le serate (o in tutte, se non se ne scelgono due)
router.get('/shared-products', authenticate, requireModule('stats'), authorizeStats, validate({ query: sharedProductsQuerySchema }), tenantScope, async (req, res) => {
  const { a, b } = req.validQuery;
  try {
    const { rows } = await req.db.query(
      `SELECT i.product_id AS id, COALESCE(p.name, MAX(i.name)) AS name
       ${COMPLETED_ITEMS}
         AND ($1::int IS NULL OR $2::int IS NULL OR o.session_id IN ($1, $2))
       GROUP BY i.product_id, p.name
       HAVING $1::int IS NULL OR $2::int IS NULL
          OR (COUNT(DISTINCT o.session_id) FILTER (WHERE o.session_id = $1) > 0
          AND COUNT(DISTINCT o.session_id) FILTER (WHERE o.session_id = $2) > 0)
       ORDER BY 2`, [a ?? null, b ?? null]);
    res.json(rows.map((r) => ({ id: Number(r.id), name: r.name }))); // bigint arriva come stringa
  } catch (err) {
    logger.error({ err }, 'Errore GET /api/stats/shared-products');
    res.status(500).json({ error: 'Errore nel caricamento dei prodotti' });
  }
});

// GET /api/stats/head-to-head?a=1&b=2&product=7 — quantità e incasso di un prodotto in due serate
router.get('/head-to-head', authenticate, requireModule('stats'), authorizeStats, validate({ query: headToHeadQuerySchema }), tenantScope, async (req, res) => {
  const { a, b, product } = req.validQuery;
  try {
    const { rows } = await req.db.query(
      `SELECT o.session_id, SUM(i.quantity) AS quantity, SUM(${LINE_REVENUE}) AS revenue
       ${COMPLETED_ITEMS} AND o.session_id IN ($1, $2) AND i.product_id = $3
       GROUP BY o.session_id`, [a, b, product]);
    const of = (id) => {
      const row = rows.find((r) => r.session_id === id);
      return { qty: Number(row?.quantity ?? 0), revenue: parseFloat(Number(row?.revenue ?? 0).toFixed(2)) };
    };
    const A = of(a), B = of(b);
    res.json([
      { metric: 'Quantità venduta', A: A.qty, B: B.qty },
      { metric: 'Incasso (€)', A: A.revenue, B: B.revenue },
    ]);
  } catch (err) {
    logger.error({ err }, 'Errore GET /api/stats/head-to-head');
    res.status(500).json({ error: 'Errore nel confronto' });
  }
});

export default router;
