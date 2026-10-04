// Utility legate alle sessioni (serate).

// Totale atteso in cassa (solo contanti per ora): somma degli ordini completati della sessione.
export async function computeExpectedCash(db, sessionId) {
  const { rows } = await db.query(
    `SELECT COALESCE(SUM(total), 0) AS expected FROM orders WHERE status = 'completed' AND session_id = $1`,
    [sessionId]
  );
  return parseFloat(rows[0].expected);
}

// Ordini della sessione non ancora completati né annullati (in attesa o in preparazione).
export async function countOpenOrders(db, sessionId) {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS count, COALESCE(SUM(total), 0) AS total
     FROM orders WHERE session_id = $1 AND status IN ('pending', 'preparing')`,
    [sessionId]
  );
  return { count: rows[0].count, total: parseFloat(rows[0].total) };
}

// Riporta l'ora dichiarata da un dispositivo dentro la sessione: gli orologi dei
// tablet possono essere sfasati, ma un ordine non può cadere fuori dalla sua serata.
export function clampToSession(clientCreatedAt, { start_time, end_time }, now = new Date()) {
  const end = end_time ? new Date(end_time) : now;
  const time = Math.min(Math.max(new Date(clientCreatedAt), new Date(start_time)), end);
  return new Date(time).toISOString();
}
