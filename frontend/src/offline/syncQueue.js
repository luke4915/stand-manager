import { db } from './db';
import { API_URL } from '../config/api';

// Mette in coda un ordine battuto senza connessione. Oltre al payload (che ha già
// la sua client_order_id) salva sessione e ora reale: il server lo assegnerà alla
// serata giusta anche se viene sincronizzato dopo la chiusura.
export async function enqueueOrder(payload, sessionId) {
  return db.pendingOrders.add({
    payload: { ...payload, session_id: sessionId, client_created_at: new Date().toISOString() },
    status: 'pending',
    createdAt: Date.now(),
  });
}

// Invia gli ordini in coda, nell'ordine in cui sono stati battuti.
// - risposta ok (anche "duplicato"): l'ordine è sul server, si toglie dalla coda;
// - rete assente, 5xx, 429: errore temporaneo, ci si ferma e si riprova più tardi;
// - 401: si rinnova la sessione e si riprova al giro successivo;
// - altri 4xx: errore definitivo, l'ordine resta salvato come 'failed' con il motivo.
// Ritorna gli ordini passati in 'failed' in questo giro.
export async function flushQueue({ refreshSession }) {
  const queued = await db.pendingOrders.where('status').equals('pending').toArray();
  const failed = [];
  for (const item of queued) {
    let res;
    try {
      res = await fetch(`${API_URL}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(item.payload),
      });
    } catch {
      break;
    }
    if (res.ok) {
      await db.pendingOrders.delete(item.localId);
      continue;
    }
    if (res.status === 401) {
      await refreshSession();
      break;
    }
    if (res.status >= 500 || res.status === 429) break;

    const { error } = await res.json().catch(() => ({}));
    const reason = error || `Errore ${res.status}`;
    await db.pendingOrders.update(item.localId, { status: 'failed', error: reason });
    failed.push({ ...item, error: reason });
  }
  return failed;
}

export async function countByStatus(status) {
  return db.pendingOrders.where('status').equals(status).count();
}
