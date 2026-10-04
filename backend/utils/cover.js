import { HttpError } from './httpError.js';
import { writeOrderItems } from './orderItemsWrite.js';
import { toCents, toEuro, checkBalance } from './payments.js';

// Il coperto di un conto (passo 2-9): una comanda automatica di tipo 'cover' con una sola riga "Coperto × coperti",
// già servita. Così totale, pagamento, incasso e statistiche la trattano come ogni altra voce (docs/design-tavoli.md).
// Il prezzo per persona si fissa all'apertura del conto (`checks.cover_charge`, dall'impostazione `cover_charge`).

export const COVER_NAME = 'Coperto';

// Prezzo per persona dall'impostazione del locale (0 se manca o non è valido).
export async function readCoverCharge(db) {
  const { rows } = await db.query(`SELECT value FROM settings WHERE key = 'cover_charge'`);
  const value = Number(String(rows[0]?.value ?? '').replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : 0;
}

// Porta la riga del coperto in linea con i coperti del conto: la crea, la aggiorna o la toglie. Il conto deve essere
// già bloccato (lockCheck). Una riga di cui è stata pagata una parte non cambia (409 COVER_PAID), e il totale non
// può scendere sotto il già pagato (409 ORDER_PAID).
export async function syncCoverOrder(db, tenantId, checkId, userId) {
  const { rows: [check] } = await db.query('SELECT id, session_id, covers, cover_charge FROM checks WHERE id = $1', [checkId]);
  const unit = Number(check.cover_charge);
  const wanted = unit > 0 ? check.covers : 0;

  const { rows: [current] } = await db.query(
    `SELECT o.id AS order_id, oi.id AS item_id, oi.quantity, EXISTS (SELECT 1 FROM payment_items pi WHERE pi.order_item_id = oi.id) AS paid
     FROM orders o JOIN order_items oi ON oi.order_id = o.id
     WHERE o.check_id = $1 AND o.order_type = 'cover' AND o.status <> 'canceled'`, [checkId]);

  if (current && current.quantity === wanted) return;
  if (current?.paid) throw new HttpError(409, 'Il coperto è già stato pagato: non si può cambiare', 'COVER_PAID');

  if (current && wanted === 0) {
    await db.query(`UPDATE orders SET status = 'canceled' WHERE id = $1`, [current.order_id]);
  } else if (current) {
    const total = toEuro(toCents(unit) * wanted);
    await db.query('UPDATE order_items SET quantity = $1, line_total = $2 WHERE id = $3', [wanted, total, current.item_id]);
    await db.query('UPDATE orders SET total = $1 WHERE id = $2', [total, current.order_id]);
  } else if (wanted > 0) {
    const total = toEuro(toCents(unit) * wanted);
    const { rows: [order] } = await db.query(
      `INSERT INTO orders (total, status, created_by, order_type, display_code, session_id, check_id, completed_at)
       VALUES ($1, 'completed', $2, 'cover', 'COP', $3, $4, now()) RETURNING id`, [total, userId, check.session_id, checkId]);
    await writeOrderItems(db, tenantId, order.id, [{
      id: null, name: COVER_NAME, quantity: wanted, price: unit, line_total: total, original_price: unit,
      type: 'sale', discountMode: null, discountValue: null, note: '', category: COVER_NAME, print_destination: null,
    }]);
  }

  const balance = await checkBalance(db, checkId);
  if (balance.paid > balance.total) throw new HttpError(409, 'Il conto è già stato pagato oltre il nuovo totale', 'ORDER_PAID');
}
