import { db } from '../offline/db.js';

// Archivio locale degli ordini stampati da questa cassa: permette di ristampare anche senza server.
// Contiene solo ciò che serve alle copie (righe con prezzi effettivi, totale, codice).
const KEEP = 100;

export async function saveLocalOrder(clientOrderId, sessionId, order) {
  await db.printedOrders.put({ clientOrderId, sessionId, order, createdAt: Date.now(), pendingReprints: [] });
  // Si tengono gli ultimi KEEP ordini, ma mai quelli con una ristampa ancora da comunicare al server
  const excess = await db.printedOrders.count() - KEEP;
  if (excess <= 0) return;
  const oldest = await db.printedOrders.orderBy('createdAt').limit(excess + 20).toArray();
  await db.printedOrders.bulkDelete(oldest.filter(r => !r.pendingReprints.length).slice(0, excess).map(r => r.clientOrderId));
}

// Ordini più recenti della sessione indicata, dal più nuovo.
export async function recentLocalOrders(sessionId, limit = 10) {
  const rows = await db.printedOrders.orderBy('createdAt').reverse().filter(r => r.sessionId === sessionId).limit(limit).toArray();
  return rows.map(r => ({ clientOrderId: r.clientOrderId, ...r.order }));
}

export async function recordPendingReprint(clientOrderId) {
  await db.printedOrders.where('clientOrderId').equals(clientOrderId).modify(r => { r.pendingReprints.push(new Date().toISOString()); });
}

// Comunica al server le ristampe fatte offline. `send(body)` esegue la chiamata e lancia in caso di errore.
// Un ordine non ancora sincronizzato (404) si riprova al giro dopo; un altro errore (rete, 5xx) ferma il giro.
export async function syncReprintAudits(send) {
  const rows = (await db.printedOrders.toArray()).filter(r => r.pendingReprints.length);
  for (const row of rows) {
    try {
      await send({ client_order_id: row.clientOrderId, reprinted_at: row.pendingReprints });
      await db.printedOrders.update(row.clientOrderId, { pendingReprints: [] });
    } catch (err) {
      if (err.status === 404) continue;
      return;
    }
  }
}
