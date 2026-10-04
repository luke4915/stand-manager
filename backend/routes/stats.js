import express from 'express';
import { authenticate, authorizeRoles } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';
import { tenantScope } from '../middleware/tenantScope.js';
import logger from '../logger.js';
import { statsQuerySchema, sharedProductsQuerySchema, headToHeadQuerySchema } from '../schemas/statsSchema.js';
import { requireModule } from '../utils/tenantModules.js';
import { buildStats, buildSessionComparison } from '../utils/stats.js';

const router = express.Router();

const authorizeStats = authorizeRoles(['admin', 'responsabile'], 'Le statistiche sono riservate ad admin e responsabili');

// Righe d'ordine espanse (una per prodotto venduto) degli ordini completati; import SQL condiviso.
// Il ricavo di riga è line_total (ordini nuovi) oppure prezzo × quantità (ordini precedenti).
const COMPLETED_ITEMS = `
  FROM orders o
  CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(o.items) = 'array' THEN o.items ELSE '[]'::jsonb END) i
  LEFT JOIN products p ON p.id = (i->>'id')::bigint
  WHERE o.status = 'completed'`;
const LINE_REVENUE = `COALESCE((i->>'line_total')::numeric, (i->>'price')::numeric * (i->>'quantity')::numeric, 0)`;

// GET /api/stats?sessions=1,2&tz=Europe/Rome — statistiche aggregate dal database (nessun ordine viaggia verso il browser).
// Senza `sessions` valgono tutte le serate. Le ore sono nel fuso `tz` del dispositivo.
router.get('/', authenticate, requireModule('stats'), authorizeStats, validate({ query: statsQuerySchema }), tenantScope, async (req, res) => {
  const { sessions, tz } = req.validQuery;
  const sessionFilter = sessions?.length ? sessions : null;
  const inSessions = 'AND ($1::int[] IS NULL OR o.session_id = ANY($1))';
  try {
    const [totals, canceled, byHour, products, comparison] = await Promise.all([
      req.db.query(
        `SELECT COUNT(*)::int AS n, COALESCE(SUM(o.total), 0) AS total,
                COUNT(*) FILTER (WHERE o.is_takeaway)::int AS takeaway,
                AVG(EXTRACT(EPOCH FROM (o.completed_at - o.created_at)) / 60)
                  FILTER (WHERE o.completed_at >= o.created_at AND o.completed_at - o.created_at < interval '180 minutes') AS avg_minutes
         FROM orders o WHERE o.status = 'completed' ${inSessions}`, [sessionFilter]),
      req.db.query(
        `SELECT COUNT(*)::int AS n, COALESCE(SUM(o.total), 0) AS total
         FROM orders o WHERE o.status = 'canceled' ${inSessions}`, [sessionFilter]),
      req.db.query(
        `SELECT EXTRACT(hour FROM o.created_at AT TIME ZONE $2)::int AS hour, COUNT(*)::int AS n, SUM(o.total) AS total,
                AVG(EXTRACT(EPOCH FROM (o.completed_at - o.created_at)) / 60)
                  FILTER (WHERE o.completed_at >= o.created_at AND o.completed_at - o.created_at < interval '180 minutes') AS avg_minutes,
                COUNT(*) FILTER (WHERE o.completed_at >= o.created_at AND o.completed_at - o.created_at < interval '180 minutes')::int AS n_minutes
         FROM orders o WHERE o.status = 'completed' ${inSessions}
         GROUP BY 1`, [sessionFilter, tz]),
      // Per id di prodotto, non per nome: un prodotto rinominato resta uno solo.
      // Il mancato incasso degli omaggi usa il prezzo di listino salvato nell'ordine (original_price).
      req.db.query(
        `SELECT (i->>'id')::bigint AS product_id,
                COALESCE(p.name, MAX(i->>'name')) AS name,
                COALESCE(MAX(i->>'category'), MAX(p.category), 'Altro') AS category,
                SUM((i->>'quantity')::int) AS quantity,
                SUM(${LINE_REVENUE}) AS revenue,
                SUM(CASE WHEN ${LINE_REVENUE} = 0
                         THEN COALESCE((i->>'original_price')::numeric, p.price, 0) * (i->>'quantity')::numeric ELSE 0 END) AS missed
         ${COMPLETED_ITEMS} ${inSessions}
         GROUP BY (i->>'id')::bigint, p.name`, [sessionFilter]),
      req.db.query(
        `SELECT s.id, s.name, s.start_time, COUNT(o.id)::int AS n, COALESCE(SUM(o.total), 0) AS total
         FROM sessions s LEFT JOIN orders o ON o.session_id = s.id AND o.status = 'completed'
         GROUP BY s.id ORDER BY s.start_time DESC`),
    ]);
    res.json({
      ...buildStats({ totals: totals.rows[0], canceled: canceled.rows[0], byHour: byHour.rows, products: products.rows }),
      confrontoSerate: buildSessionComparison(comparison.rows),
    });
  } catch (err) {
    logger.error({ err }, 'Errore GET /api/stats');
    res.status(500).json({ error: 'Errore nel calcolo delle statistiche' });
  }
});

// GET /api/stats/shared-products?a=1&b=2 — prodotti venduti in entrambe le serate (o in tutte, se non se ne scelgono due)
router.get('/shared-products', authenticate, requireModule('stats'), authorizeStats, validate({ query: sharedProductsQuerySchema }), tenantScope, async (req, res) => {
  const { a, b } = req.validQuery;
  try {
    const { rows } = await req.db.query(
      `SELECT (i->>'id')::bigint AS id, COALESCE(p.name, MAX(i->>'name')) AS name
       ${COMPLETED_ITEMS}
         AND ($1::int IS NULL OR $2::int IS NULL OR o.session_id IN ($1, $2))
       GROUP BY (i->>'id')::bigint, p.name
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
      `SELECT o.session_id, SUM((i->>'quantity')::int) AS quantity, SUM(${LINE_REVENUE}) AS revenue
       ${COMPLETED_ITEMS} AND o.session_id IN ($1, $2) AND (i->>'id')::bigint = $3
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
