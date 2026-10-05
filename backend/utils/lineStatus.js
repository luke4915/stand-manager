import { HttpError } from './httpError.js';

// Stato per riga di una comanda (passo 3-3). Le righe hanno il loro stato (`prep_status`); lo stato della comanda si
// ricava da loro, così le due cose non si contraddicono mai. Postazioni: una riga è del bar se si stampa solo al bar,
// altrimenti è della cucina (anche «bar + cucina»).

export const LINE_STATUSES = ['new', 'preparing', 'ready', 'served'];

export const stationOf = (printDestination) => (printDestination === 'bar' ? 'bar' : 'kitchen');

// Stato della comanda dato lo stato delle sue righe: tutte pronte (o servite) = completata; almeno una avviata =
// in preparazione; nessuna = in attesa. Una comanda senza righe non cambia.
export function orderStatusFromLines(statuses) {
  if (!statuses.length) return null;
  if (statuses.every(s => s === 'ready' || s === 'served')) return 'completed';
  if (statuses.some(s => s !== 'new')) return 'preparing';
  return 'pending';
}

// Imposta lo stato delle righe di una comanda e aggiorna lo stato della comanda. `lineIds` (id in order_items) e
// `station` restringono le righe; senza nessuno dei due vale per tutte. Si può avanzare e tornare indietro (un tocco
// sbagliato in cucina si corregge), ma una riga già servita la tocca solo chi può servire. Va chiamata in transazione.
// Ritorna { order, changed } (le righe cambiate) o lancia HttpError.
export async function setLineStatus(db, orderId, { status, lineIds, station, canServe }) {
  const { rows: [order] } = await db.query('SELECT id, status, check_id, order_type FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
  if (!order) throw new HttpError(404, 'Ordine non trovato');
  if (order.status === 'canceled') throw new HttpError(409, 'La comanda è stata stornata', 'ORDER_CANCELED');
  if (order.status === 'scheduled') throw new HttpError(409, 'La portata non è ancora stata mandata', 'ORDER_SCHEDULED');
  if (order.order_type === 'cover') throw new HttpError(409, 'Il coperto non passa dalla cucina', 'COVER_ORDER');

  const { rows: lines } = await db.query(
    'SELECT id, prep_status, print_destination FROM order_items WHERE order_id = $1 ORDER BY position FOR UPDATE', [orderId]);
  if (lineIds && lineIds.some(id => !lines.some(l => l.id === id))) throw new HttpError(404, 'Una delle righe non fa parte della comanda', 'LINE_NOT_FOUND');

  const chosen = lines.filter(l => (!lineIds || lineIds.includes(l.id)) && (!station || stationOf(l.print_destination) === station));
  if (!canServe && chosen.some(l => l.prep_status === 'served'))
    throw new HttpError(403, 'Una riga già servita la modifica solo il personale di sala', 'LINE_SERVED');

  const changed = chosen.filter(l => l.prep_status !== status).map(l => l.id);
  if (changed.length) {
    await db.query(
      `UPDATE order_items SET prep_status = $1,
         ready_at = CASE WHEN $1 IN ('ready', 'served') THEN COALESCE(ready_at, now()) ELSE NULL END,
         served_at = CASE WHEN $1 = 'served' THEN now() ELSE NULL END
       WHERE id = ANY($2::int[])`, [status, changed]);
    const next = orderStatusFromLines(lines.map(l => (changed.includes(l.id) ? status : l.prep_status)));
    if (next && next !== order.status)
      await db.query(
        `UPDATE orders SET status = $1, completed_at = CASE WHEN $1 = 'completed' THEN COALESCE(completed_at, now()) ELSE NULL END WHERE id = $2`,
        [next, orderId]);
  }
  return { order, changed };
}
