import { HttpError } from './httpError.js';

// Pagamenti dei conti dei tavoli (passo 2-5 e pagamento per voce). Tutti gli importi si calcolano in centesimi
// interi sul server: il client indica il metodo e cosa paga, mai quanto vale una riga (CLAUDE.md §4).

export const toCents = (euro) => Math.round(Number(euro) * 100);
export const toEuro = (cents) => cents / 100;

// Il conto, bloccato per la durata della transazione: pagamenti, nuove comande e annullamenti si mettono in fila.
export async function lockCheck(db, checkId, { mustBeOpen = true } = {}) {
  const { rows } = await db.query('SELECT id, status, session_id FROM checks WHERE id = $1 FOR UPDATE', [checkId]);
  if (!rows.length) throw new HttpError(404, 'Conto non trovato');
  if (mustBeOpen && rows[0].status !== 'open') throw new HttpError(409, 'Il conto non è più aperto', 'CHECK_CLOSED');
  return rows[0];
}

// Totale (comande non annullate), pagato e residuo, in centesimi.
export async function checkBalance(db, checkId) {
  const { rows } = await db.query(
    `SELECT COALESCE((SELECT SUM(o.total) FROM orders o WHERE o.check_id = $1 AND o.status <> 'canceled'), 0) AS total,
            COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.check_id = $1), 0) AS paid`, [checkId]);
  const total = toCents(rows[0].total), paid = toCents(rows[0].paid);
  return { total, paid, due: Math.max(0, total - paid) };
}

// Righe del conto con quanto ne è già stato pagato (per voce).
const LINES_SQL = `
  SELECT oi.id, oi.name, oi.quantity, oi.line_total,
         COALESCE(SUM(pi.quantity), 0)::int AS paid_quantity, COALESCE(SUM(pi.amount), 0) AS paid_amount
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id AND o.check_id = $1 AND o.status <> 'canceled'
  LEFT JOIN payment_items pi ON pi.order_item_id = oi.id`;

// Importo e quote di un pagamento per voce. La quota di una riga è proporzionale alla quantità pagata; l'ultima quota
// prende il resto, così le quote di una riga sommano esattamente il suo totale.
export async function priceItemPayment(db, checkId, items) {
  const { rows } = await db.query(
    `${LINES_SQL} WHERE oi.id = ANY($2::int[]) GROUP BY oi.id`, [checkId, items.map(i => i.order_item_id)]);
  const byId = new Map(rows.map(r => [r.id, r]));
  const lines = items.map(({ order_item_id, quantity }) => {
    const line = byId.get(order_item_id);
    if (!line) throw new HttpError(404, 'Una delle righe non fa parte del conto', 'ITEM_NOT_FOUND');
    const remaining = line.quantity - line.paid_quantity;
    if (quantity > remaining)
      throw new HttpError(409, `"${line.name}": ne restano da pagare ${remaining}`, 'ITEM_ALREADY_PAID');
    const leftCents = toCents(line.line_total) - toCents(line.paid_amount);
    const cents = quantity === remaining ? leftCents : Math.min(leftCents, Math.round(toCents(line.line_total) * quantity / line.quantity));
    return { order_item_id, quantity, cents, name: line.name };
  });
  return { lines, cents: lines.reduce((s, l) => s + l.cents, 0) };
}

// Registra un pagamento sul conto e lo chiude se il residuo arriva a zero. Va chiamata in transazione.
// `items`: [{ order_item_id, quantity }] per pagare delle voci; altrimenti `amount` (euro) per un pagamento a importo.
export async function recordPayment(db, { checkId, method, amount, items, userId }) {
  await lockCheck(db, checkId);
  const balance = await checkBalance(db, checkId);

  let cents, lines = [];
  if (items) ({ cents, lines } = await priceItemPayment(db, checkId, items));
  else cents = toCents(amount);

  if (cents <= 0) throw new HttpError(400, 'Niente da pagare per le voci scelte', 'NOTHING_TO_PAY');
  if (cents > balance.due)
    throw new HttpError(409, `L'importo supera il residuo del conto (${toEuro(balance.due).toFixed(2)} €)`, 'AMOUNT_EXCEEDS_DUE');

  const { rows: [payment] } = await db.query(
    'INSERT INTO payments (check_id, method, amount, paid_by) VALUES ($1, $2, $3, $4) RETURNING id, method, amount, paid_at',
    [checkId, method, toEuro(cents), userId]);
  for (const l of lines)
    await db.query('INSERT INTO payment_items (payment_id, order_item_id, quantity, amount) VALUES ($1, $2, $3, $4)',
      [payment.id, l.order_item_id, l.quantity, toEuro(l.cents)]);

  const due = balance.due - cents;
  if (due === 0) await closeAsPaid(db, checkId);
  return { payment: { ...payment, amount: Number(payment.amount) }, due: toEuro(due), closed: due === 0 };
}

// Un conto con portate ancora da mandare non si chiude: prima si mandano o si stornano (se no una portata pagata
// non uscirebbe mai). Se arriva da un pagamento, la transazione si annulla e il pagamento non viene registrato.
export async function closeAsPaid(db, checkId) {
  const { rows: [{ n }] } = await db.query(`SELECT COUNT(*)::int AS n FROM orders WHERE check_id = $1 AND status = 'scheduled'`, [checkId]);
  if (n > 0) throw new HttpError(409, 'Ci sono portate ancora da mandare: mandale o stornale prima di chiudere il conto', 'COURSES_PENDING');
  await db.query(`UPDATE checks SET status = 'paid', closed_at = now(), bill_requested_at = NULL WHERE id = $1`, [checkId]);
}

// Una comanda non si storna se ne è già stata pagata una parte, o se il totale scenderebbe sotto il già pagato.
// Il conto deve essere già bloccato (lockCheck).
export async function assertOrderCancelable(db, checkId, orderId) {
  const { rows: [{ n }] } = await db.query(
    `SELECT COUNT(*)::int AS n FROM payment_items pi JOIN order_items oi ON oi.id = pi.order_item_id WHERE oi.order_id = $1`, [orderId]);
  if (n > 0) throw new HttpError(409, 'Una parte della comanda è già stata pagata: non si può stornare', 'ORDER_PAID');
  const balance = await checkBalance(db, checkId);
  const { rows: [order] } = await db.query('SELECT total, status FROM orders WHERE id = $1', [orderId]);
  const after = order.status === 'canceled' ? balance.total : balance.total - toCents(order.total);
  if (after < balance.paid)
    throw new HttpError(409, 'Il conto è già stato pagato oltre questo importo: non si può stornare la comanda', 'ORDER_PAID');
}

// Pagamenti del conto con le voci pagate, e per ogni riga quanto ne resta da pagare (per il pannello del conto).
export async function loadPayments(db, checkId) {
  const { rows } = await db.query(
    `SELECT p.id, p.method, p.amount, p.paid_at, u.username AS paid_by_name,
            COALESCE(json_agg(json_build_object('order_item_id', pi.order_item_id, 'name', oi.name, 'quantity', pi.quantity, 'amount', pi.amount)
                              ORDER BY pi.id) FILTER (WHERE pi.id IS NOT NULL), '[]') AS items
     FROM payments p
     LEFT JOIN users u ON u.id = p.paid_by
     LEFT JOIN payment_items pi ON pi.payment_id = p.id
     LEFT JOIN order_items oi ON oi.id = pi.order_item_id
     WHERE p.check_id = $1 GROUP BY p.id, u.username ORDER BY p.id`, [checkId]);
  return rows.map(p => ({ ...p, amount: Number(p.amount), items: p.items.map(i => ({ ...i, amount: Number(i.amount) })) }));
}

export async function loadLinePayments(db, checkId) {
  const { rows } = await db.query(`${LINES_SQL} GROUP BY oi.id`, [checkId]);
  return new Map(rows.map(r => [r.id, {
    paid_quantity: r.paid_quantity,
    remaining_quantity: r.quantity - r.paid_quantity,
    remaining_amount: toEuro(toCents(r.line_total) - toCents(r.paid_amount)),
  }]));
}
