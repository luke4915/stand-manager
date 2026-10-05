// Righe d'ordine lette da `order_items`, nella forma che l'API ha sempre avuto (`items` di un ordine) così app e cassa
// non cambiano. Le usano le route che mostrano, stampano o stornano un ordine.

const toNumber = (v) => (v === null || v === undefined ? null : Number(v));

// `product_id` e i prezzi sono bigint/numeric: pg li restituisce come stringhe.
export const rowToItem = (r) => ({
  line_id: r.id,
  prep_status: r.prep_status,
  id: toNumber(r.product_id),
  name: r.name,
  quantity: r.quantity,
  price: Number(r.unit_price),
  line_total: Number(r.line_total),
  original_price: toNumber(r.original_price),
  type: r.line_type,
  discountMode: r.discount_mode,
  discountValue: toNumber(r.discount_value),
  note: r.note,
  category: r.category,
  print_destination: r.print_destination,
});

// Mappa orderId → righe in ordine di posizione. Un ordine senza righe non compare nella mappa.
export async function loadItems(db, orderIds) {
  const byOrder = new Map();
  if (!orderIds.length) return byOrder;
  const { rows } = await db.query(
    `SELECT id, order_id, product_id, name, category, print_destination, quantity, unit_price, line_total, original_price,
            line_type, discount_mode, discount_value, note, prep_status
     FROM order_items WHERE order_id = ANY($1::int[]) ORDER BY order_id, position`, [orderIds]);
  for (const r of rows) {
    if (!byOrder.has(r.order_id)) byOrder.set(r.order_id, []);
    byOrder.get(r.order_id).push(rowToItem(r));
  }
  return byOrder;
}

// Gli stessi ordini, ciascuno con la sua lista `items` (vuota se non ha righe).
export async function withItems(db, orders) {
  const byOrder = await loadItems(db, orders.map((o) => o.id));
  return orders.map((o) => ({ ...o, items: byOrder.get(o.id) ?? [] }));
}
