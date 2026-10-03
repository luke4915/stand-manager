import { db } from './db';
import { fetchWithAuth, ApiError } from '../utils/apiClient';

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
// - altri errori (es. sessione chiusa da più di 24 ore): definitivi, l'ordine resta
//   salvato come 'failed' con il motivo.
// La sessione scaduta (401) la gestisce fetchWithAuth, rinnovandola.
// Ritorna gli ordini passati in 'failed' in questo giro.
export async function flushQueue() {
  const queued = await db.pendingOrders.where('status').equals('pending').toArray();
  const failed = [];
  for (const item of queued) {
    try {
      await fetchWithAuth('/orders', { method: 'POST', body: item.payload });
      await db.pendingOrders.delete(item.localId);
    } catch (err) {
      if (!(err instanceof ApiError) || err.status >= 500 || err.status === 429 || err.status === 401) break;
      await db.pendingOrders.update(item.localId, { status: 'failed', error: err.message });
      failed.push({ ...item, error: err.message });
    }
  }
  return failed;
}

export async function countByStatus(status) {
  return db.pendingOrders.where('status').equals(status).count();
}
