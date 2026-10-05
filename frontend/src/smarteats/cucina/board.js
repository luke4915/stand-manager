// Logica del monitor cucina: da quanto aspetta una comanda, quanto è urgente, come si ordinano e si raggruppano.
// Una comanda di un tavolo è una portata (passo 3-1): arriva quando il cameriere la manda, e porta tavolo e coperti.

// Minuti trascorsi da quando la comanda è uscita (mandata in cucina; per le vecchie comande, da quando è stata creata).
export const minutesSince = (order, now = Date.now()) =>
  Math.max(0, Math.floor((now - new Date(order.fired_at ?? order.created_at).getTime()) / 60000));

// Soglie in minuti: oltre `warn` è da sbrigare, oltre `late` è in ritardo.
export const WARN_MINUTES = 10;
export const LATE_MINUTES = 20;
export const urgency = (minutes) => (minutes >= LATE_MINUTES ? 'late' : minutes >= WARN_MINUTES ? 'warn' : 'ok');

// Comande da preparare (la riga automatica del coperto non è per la cucina), le più vecchie per prime.
export function activeOrders(orders, now = Date.now()) {
  return orders
    .filter(o => ['pending', 'preparing'].includes(o.status) && o.order_type !== 'cover')
    .map(o => ({ ...o, minutes: minutesSince(o, now) }))
    .sort((a, b) => new Date(a.fired_at ?? a.created_at) - new Date(b.fired_at ?? b.created_at) || a.id - b.id);
}

// Portate già sul conto ma non ancora mandate, raggruppate per tavolo, per far vedere alla cucina cosa sta per arrivare.
export function upcomingByTable(orders) {
  const byTable = new Map();
  for (const o of orders.filter(x => x.status === 'scheduled')) {
    const key = o.table_name ?? `Conto ${o.check_number ?? o.check_id}`;
    byTable.set(key, [...(byTable.get(key) ?? []), o]);
  }
  return [...byTable].map(([table, list]) => ({
    table,
    courses: list.sort((a, b) => a.course_seq - b.course_seq || a.id - b.id).map(o => o.course_name ?? 'Subito'),
  }));
}

// Dopo una modifica di stato: la comanda cambia, e se è finita esce dall'elenco.
export const withStatus = (orders, id, status) => orders.map(o => (o.id === id ? { ...o, status } : o));
