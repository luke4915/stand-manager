import { toOrderItemRows } from './orderItems.js';
import { insertOrderItemRows } from './orderItemsWrite.js';

// Riempimento e verifica di `order_items` dai vecchi ordini (orders.items). Le funzioni lavorano su una connessione
// già legata al tenant (app.tenant_id impostato), come il resto del backend; le chiama scripts/order-items.js.
//
// ATTENZIONE: lo script gira spesso con un utente privilegiato che scavalca la RLS (superutente o BYPASSRLS). Per questo
// ogni query filtra anche esplicitamente sul tenant: affidarsi solo alla RLS leggerebbe, e con --apply scriverebbe,
// gli ordini di tutti i tenant sotto quello sbagliato.
const TENANT = "NULLIF(current_setting('app.tenant_id', true), '')::int";

const BATCH_ORDERS = 500;
const EXAMPLES = 5;

function addAnomalies(report, orderId, anomalies) {
  for (const type of anomalies) {
    const entry = (report.anomalies[type] ??= { count: 0, examples: [] });
    entry.count++;
    if (entry.examples.length < EXAMPLES && !entry.examples.includes(orderId)) entry.examples.push(orderId);
  }
}

// Legge gli ordini del tenant a gruppi e prepara le righe. Con `apply` le scrive (un gruppo per transazione),
// altrimenti conta soltanto. `skipDone` salta gli ordini che hanno già delle righe (serve la tabella); senza,
// analizza tutto e funziona anche prima della migrazione 027.
export async function scanTenant(db, tenantId, { apply = false, skipDone = true } = {}) {
  const report = { orders: 0, ordersToFill: 0, rows: 0, skippedRows: 0, anomalies: {} };
  let lastId = 0;
  for (;;) {
    const { rows: orders } = await db.query(
      `SELECT o.id, o.items${skipDone ? `, EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id AND i.tenant_id = ${TENANT}) AS done` : ''}
       FROM orders o WHERE o.id > $1 AND o.tenant_id = ${TENANT} ORDER BY o.id LIMIT $2`, [lastId, BATCH_ORDERS]);
    if (!orders.length) break;
    lastId = orders[orders.length - 1].id;

    const toInsert = [];
    for (const order of orders) {
      report.orders++;
      if (order.done) continue;
      const { rows, anomalies } = toOrderItemRows(order.items);
      addAnomalies(report, order.id, anomalies);
      if (rows.length) report.ordersToFill++;
      report.rows += rows.length;
      report.skippedRows += anomalies.filter((a) => a === 'quantita_non_valida' || a === 'riga_non_valida').length;
      for (const row of rows) toInsert.push({ ...row, order_id: order.id });
    }

    if (apply && toInsert.length) {
      await db.query('BEGIN');
      try {
        await insertOrderItemRows(db, tenantId, toInsert);
        await db.query('COMMIT');
      } catch (err) {
        await db.query('ROLLBACK');
        throw err;
      }
    }
  }
  return report;
}

// Numero da un testo JSON solo se è davvero un numero: i dati vecchi possono contenere altro.
const num = (expr) => `(CASE WHEN ${expr} ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (${expr})::numeric END)`;
const QTY = num(`j.item->>'quantity'`);
const PRICE = num(`j.item->>'price'`);
const LINE_TOTAL = num(`j.item->>'line_total'`);
const PRODUCT_ID = `(CASE WHEN (j.item->>'id') ~ '^[0-9]{1,16}(\\.0+)?$' AND ((j.item->>'id')::numeric) BETWEEN 1 AND 9007199254740991 THEN ((j.item->>'id')::numeric)::bigint END)`;

// Confronta, riga per riga, il JSONB con la tabella: stessa posizione, nome, quantità, importo e prodotto.
// "attese" sono le righe che non si possono rappresentare (quantità non valida): senza riga per scelta.
export async function verifyTenant(db) {
  const { rows } = await db.query(`
    WITH j AS (
      SELECT o.id AS order_id, (e.ord - 1)::int AS position, e.item
      FROM orders o
      CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(o.items) = 'array' THEN o.items ELSE '[]'::jsonb END)
        WITH ORDINALITY e(item, ord)
      WHERE o.tenant_id = ${TENANT}
    ), n AS (
      SELECT * FROM order_items WHERE tenant_id = ${TENANT}
    )
    SELECT COALESCE(j.order_id, n.order_id) AS order_id, COALESCE(j.position, n.position) AS position,
      CASE
        WHEN j.order_id IS NULL THEN 'riga_in_piu'
        WHEN n.id IS NULL AND (${QTY} IS NULL OR ${QTY} <= 0 OR ${QTY} <> trunc(${QTY})) THEN 'attesa_quantita_non_valida'
        WHEN n.id IS NULL THEN 'manca_riga'
        ELSE 'valori_diversi'
      END AS problem
    FROM j FULL JOIN n ON n.order_id = j.order_id AND n.position = j.position
    WHERE n.id IS NULL OR j.order_id IS NULL
       OR n.name IS DISTINCT FROM COALESCE(j.item->>'name', '')
       OR n.quantity::numeric IS DISTINCT FROM ${QTY}
       OR abs(n.line_total - COALESCE(${LINE_TOTAL}, ${PRICE} * ${QTY}, 0)) > 0.005
       OR n.product_id IS DISTINCT FROM ${PRODUCT_ID}
    ORDER BY 1, 2`);

  const counts = { manca_riga: 0, riga_in_piu: 0, valori_diversi: 0, attesa_quantita_non_valida: 0 };
  const examples = {};
  for (const r of rows) {
    counts[r.problem]++;
    (examples[r.problem] ??= []).length < EXAMPLES && examples[r.problem].push({ order_id: r.order_id, position: r.position });
  }

  const { rows: [info] } = await db.query(`
    SELECT (SELECT count(*)::int FROM orders WHERE tenant_id = ${TENANT}) AS orders,
           (SELECT count(*)::int FROM order_items WHERE tenant_id = ${TENANT}) AS rows,
           (SELECT count(*)::int FROM orders o WHERE o.tenant_id = ${TENANT} AND EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id)
              AND abs(o.total - (SELECT sum(i.line_total) FROM order_items i WHERE i.order_id = o.id)) > 0.01) AS total_differs`);

  // Gli "attesi" non sono un errore; tutto il resto sì.
  const errors = counts.manca_riga + counts.riga_in_piu + counts.valori_diversi;
  return { ...info, counts, examples, errors };
}
