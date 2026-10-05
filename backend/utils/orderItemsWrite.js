import { toOrderItemRows } from './orderItems.js';

// Scrittura delle righe d'ordine in `order_items`, usata dalla creazione ordine (routes/orders.js).

const ROWS_PER_INSERT = 200;

const COLUMNS = ['tenant_id', 'order_id', 'position', 'product_id', 'name', 'category', 'print_destination', 'quantity',
  'unit_price', 'line_total', 'original_price', 'line_type', 'discount_mode', 'discount_value', 'note', 'modifiers'];

// `rows` hanno già `order_id`. Una posizione già presente per quell'ordine non si riscrive (il riempimento è ripetibile).
export async function insertOrderItemRows(db, tenantId, rows) {
  for (let i = 0; i < rows.length; i += ROWS_PER_INSERT) {
    const chunk = rows.slice(i, i + ROWS_PER_INSERT);
    const params = [];
    const tuples = chunk.map((r) => {
      const values = [tenantId, r.order_id, r.position, r.product_id, r.name, r.category, r.print_destination, r.quantity,
        r.unit_price, r.line_total, r.original_price, r.line_type, r.discount_mode, r.discount_value, r.note, r.modifiers ?? '[]'];
      return `(${values.map((v) => { params.push(v); return `$${params.length}`; }).join(', ')})`;
    });
    await db.query(`INSERT INTO order_items (${COLUMNS.join(', ')}) VALUES ${tuples.join(', ')} ON CONFLICT (order_id, position) DO NOTHING`, params);
  }
}

// Scrive le righe di un ordine appena creato. Va chiamata dentro la transazione dell'ordine, subito dopo l'INSERT in
// `orders`: le righe sono parte dell'ordine, quindi se non si scrivono tutte la transazione si annulla e l'ordine non nasce.
// `items` sono le righe già verificate dal server (prezzi ricalcolati, nome e categoria dal catalogo).
export async function writeOrderItems(db, tenantId, orderId, items) {
  const { rows } = toOrderItemRows(items);
  if (rows.length !== items.length)
    throw new Error(`Righe d'ordine non rappresentabili (${rows.length} su ${items.length}) per l'ordine ${orderId}`);
  await insertOrderItemRows(db, tenantId, rows.map((r) => ({ ...r, order_id: orderId })));
}
