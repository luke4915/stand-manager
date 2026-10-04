import logger from '../logger.js';
import { toOrderItemRows } from './orderItems.js';

// Scrittura delle righe d'ordine in `order_items`. Le usano la creazione ordine (doppia scrittura, routes/orders.js)
// e il riempimento dei vecchi ordini (utils/orderItemsBackfill.js).

const ROWS_PER_INSERT = 200;

const COLUMNS = ['tenant_id', 'order_id', 'position', 'product_id', 'name', 'category', 'print_destination', 'quantity',
  'unit_price', 'line_total', 'original_price', 'line_type', 'discount_mode', 'discount_value', 'note'];

// `rows` hanno già `order_id`. Una posizione già presente per quell'ordine non si riscrive (il riempimento è ripetibile).
export async function insertOrderItemRows(db, tenantId, rows) {
  for (let i = 0; i < rows.length; i += ROWS_PER_INSERT) {
    const chunk = rows.slice(i, i + ROWS_PER_INSERT);
    const params = [];
    const tuples = chunk.map((r) => {
      const values = [tenantId, r.order_id, r.position, r.product_id, r.name, r.category, r.print_destination, r.quantity,
        r.unit_price, r.line_total, r.original_price, r.line_type, r.discount_mode, r.discount_value, r.note];
      return `(${values.map((v) => { params.push(v); return `$${params.length}`; }).join(', ')})`;
    });
    await db.query(`INSERT INTO order_items (${COLUMNS.join(', ')}) VALUES ${tuples.join(', ')} ON CONFLICT (order_id, position) DO NOTHING`, params);
  }
}

// Doppia scrittura: da chiamare dentro la transazione dell'ordine, subito dopo l'INSERT in `orders`.
// Il JSONB è ancora la fonte di verità, quindi un errore qui non deve mai bloccare una vendita: la scrittura sta in un
// SAVEPOINT, e se fallisce l'ordine passa lo stesso. L'errore si logga; `scripts/order-items.js verify` lo mostra come
// riga mancante e `backfill` rifà la copia.
export async function writeOrderItems(db, tenantId, orderId, items) {
  const { rows, anomalies } = toOrderItemRows(items);
  if (anomalies.length) logger.warn({ orderId, anomalies }, 'Righe d\'ordine con anomalie nella copia in tabella');

  await db.query('SAVEPOINT order_items_copy');
  try {
    await insertOrderItemRows(db, tenantId, rows.map((r) => ({ ...r, order_id: orderId })));
    await db.query('RELEASE SAVEPOINT order_items_copy');
  } catch (err) {
    await db.query('ROLLBACK TO SAVEPOINT order_items_copy');
    logger.error({ err, orderId }, 'Righe d\'ordine non scritte in order_items: l\'ordine è valido, rifare la copia con scripts/order-items.js backfill');
  }
}
