import { db } from './db.js';

// Ordini battuti offline e rifiutati per sempre dal server (stato 'failed'): la cassa li vede qui, può
// riprovare l'invio (se la causa è stata risolta) o toglierli dall'elenco quando li ha sistemati a mano.

// Dall'archivio degli ordini stampati si recuperano codice e totale (il payload non li contiene).
export async function listFailedOrders() {
  const rows = await db.pendingOrders.where('status').equals('failed').sortBy('createdAt');
  return Promise.all(rows.map(async ({ localId, payload, error, createdAt }) => {
    const printed = payload.client_order_id ? await db.printedOrders.get(payload.client_order_id) : null;
    return {
      localId,
      error: error || 'Rifiutato dal server',
      createdAt: payload.client_created_at || new Date(createdAt).toISOString(),
      displayCode: printed?.order?.display_code ?? null,
      total: printed?.order?.total ?? null,
      items: (payload.items || []).map(i => ({ name: i.name, quantity: i.quantity, note: i.note || '' })),
    };
  }));
}

// Rimette l'ordine in coda: al prossimo giro di sincronizzazione viene inviato di nuovo.
export async function retryFailedOrder(localId) {
  await db.pendingOrders.where('localId').equals(localId).and(o => o.status === 'failed')
    .modify(o => { o.status = 'pending'; delete o.error; });
}

// Toglie l'ordine dalla coda per sempre (solo se è davvero rifiutato).
export async function discardFailedOrder(localId) {
  await db.pendingOrders.where('localId').equals(localId).and(o => o.status === 'failed').delete();
}
