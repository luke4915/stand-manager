import { withItems } from './orderItemsRead.js';
import { HttpError } from './httpError.js';
import { loadPayments, loadLinePayments } from './payments.js';

// Conti dei tavoli: lettura con i totali calcolati dal server. Il client non decide mai importi (CLAUDE.md §4).

// Un conto con tavolo, sala, chi lo ha aperto e il totale delle comande non annullate.
const SUMMARY_SQL = `
  SELECT c.id, c.number, c.status, c.session_id, c.table_id, t.name AS table_name, t.room_id, r.name AS room_name,
         c.covers, c.merged_into, c.opened_by, u.username AS opened_by_name, c.opened_at, c.bill_requested_at, c.closed_at,
         COALESCE((SELECT SUM(o.total) FROM orders o WHERE o.check_id = c.id AND o.status <> 'canceled'), 0) AS orders_total,
         (SELECT COUNT(*) FROM orders o WHERE o.check_id = c.id AND o.status <> 'canceled')::int AS orders_count,
         COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.check_id = c.id), 0) AS paid_total
  FROM checks c
  LEFT JOIN dining_tables t ON t.id = c.table_id
  LEFT JOIN rooms r ON r.id = t.room_id
  LEFT JOIN users u ON u.id = c.opened_by`;

// Importi in euro come numeri (pg restituisce i numeric come stringhe). `due` è ciò che resta da pagare.
const toSummary = ({ paid_total, ...row }) => {
  const total = Number(row.orders_total);
  const paid = Number(paid_total);
  return { ...row, orders_total: total, total, paid, due: Math.max(0, +(total - paid).toFixed(2)) };
};

export async function listChecks(db, { status = 'open', tableId = null } = {}) {
  const { rows } = await db.query(
    `${SUMMARY_SQL} WHERE c.status = $1 AND ($2::int IS NULL OR c.table_id = $2) ORDER BY c.opened_at DESC, c.id DESC`,
    [status, tableId]);
  return rows.map(toSummary);
}

export async function getCheckSummary(db, id) {
  const { rows } = await db.query(`${SUMMARY_SQL} WHERE c.id = $1`, [id]);
  return rows[0] ? toSummary(rows[0]) : null;
}

// Il conto con le sue comande e le righe di ciascuna.
export async function getCheckDetail(db, id) {
  const summary = await getCheckSummary(db, id);
  if (!summary) throw new HttpError(404, 'Conto non trovato');
  const { rows } = await db.query(
    `SELECT id, display_code, status, created_at, total, is_takeaway, order_type FROM orders WHERE check_id = $1 ORDER BY id`, [id]);
  const linePayments = await loadLinePayments(db, id);
  // `line_id` (id in order_items) serve a pagare o scontare una voce; le righe di un ordine sono già in ordine di posizione.
  const { rows: lineIds } = await db.query(
    `SELECT oi.id, oi.order_id FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.check_id = $1 ORDER BY oi.order_id, oi.position`, [id]);
  const idsByOrder = new Map();
  for (const l of lineIds) idsByOrder.set(l.order_id, [...(idsByOrder.get(l.order_id) ?? []), l.id]);
  const orders = (await withItems(db, rows)).map(o => ({
    ...o, total: Number(o.total),
    // Per ogni riga: quanta ne è già pagata e quanto resta (solo per le comande non annullate)
    items: o.items.map((i, idx) => {
      const line_id = idsByOrder.get(o.id)?.[idx] ?? null;
      return { ...i, line_id, ...(linePayments.get(line_id) ?? {}) };
    }),
  }));
  return { ...summary, orders, payments: await loadPayments(db, id) };
}

// Dati della ricevuta non fiscale. Di tutto il conto (righe di ogni comanda non annullata, pagamenti e residuo), oppure
// di un solo pagamento: le voci che ha saldato, o una riga "pagamento a importo" se non era per voce.
export async function getCheckReceipt(db, checkId, paymentId = null) {
  const summary = await getCheckSummary(db, checkId);
  if (!summary) throw new HttpError(404, 'Conto non trovato');
  const payments = await loadPayments(db, checkId);
  const base = {
    check: { id: summary.id, number: summary.number, status: summary.status, table_name: summary.table_name, covers: summary.covers, opened_at: summary.opened_at, closed_at: summary.closed_at },
    total: summary.total, paid: summary.paid, due: summary.due,
  };

  if (paymentId !== null) {
    const payment = payments.find(p => p.id === paymentId);
    if (!payment) throw new HttpError(404, 'Pagamento non trovato');
    const lines = payment.items.length
      ? payment.items.map(i => ({ name: i.name, quantity: i.quantity, amount: i.amount }))
      : [{ name: 'Pagamento a importo', quantity: 1, amount: payment.amount }];
    return { ...base, scope: 'payment', lines, payments: [payment] };
  }

  const { rows } = await db.query(
    `SELECT oi.name, oi.quantity, oi.line_total FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE o.check_id = $1 AND o.status <> 'canceled' ORDER BY oi.order_id, oi.position`, [checkId]);
  return { ...base, scope: 'check', lines: rows.map(r => ({ name: r.name, quantity: r.quantity, amount: Number(r.line_total) })), payments };
}
