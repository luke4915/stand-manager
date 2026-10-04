import { expectedCashSql } from './revenue.js';

// Utility legate alle sessioni (serate).

// Contanti attesi in cassa: ordini pagati subito più pagamenti in contanti dei conti (vedi utils/revenue.js).
export async function computeExpectedCash(db, sessionId) {
  const { rows } = await db.query(`SELECT ${expectedCashSql('$1')} AS expected`, [sessionId]);
  return parseFloat(rows[0].expected);
}

// Ordini pagati subito, della sessione, non ancora completati né annullati (in attesa o in preparazione).
// Le comande dei tavoli non sono qui: le tiene il conto, vedi countOpenChecks.
export async function countOpenOrders(db, sessionId) {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS count, COALESCE(SUM(total), 0) AS total
     FROM orders WHERE session_id = $1 AND check_id IS NULL AND status IN ('pending', 'preparing')`,
    [sessionId]
  );
  return { count: rows[0].count, total: parseFloat(rows[0].total) };
}

// Conti dei tavoli ancora aperti nella sessione, con quanto resta da incassare: bloccano la chiusura del servizio.
export async function countOpenChecks(db, sessionId) {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS count,
            COALESCE(SUM((SELECT COALESCE(SUM(o.total), 0) FROM orders o WHERE o.check_id = c.id AND o.status <> 'canceled')), 0) AS total
     FROM checks c WHERE c.session_id = $1 AND c.status = 'open'`,
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
