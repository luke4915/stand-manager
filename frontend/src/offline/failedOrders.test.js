// Ordini offline rifiutati: elenco con codice e totale, nuovo tentativo ed eliminazione (IndexedDB finto).
import 'fake-indexeddb/auto';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const { db } = await import('./db.js');
const { listFailedOrders, retryFailedOrder, discardFailedOrder } = await import('./failedOrders.js');
const countByStatus = (status) => db.pendingOrders.where('status').equals(status).count();

const queue = (status, extra = {}) => db.pendingOrders.add({
  status, createdAt: Date.now(), error: status === 'failed' ? 'Sessione chiusa' : undefined,
  payload: { client_order_id: `id-${Math.random()}`, client_created_at: '2026-10-03T20:00:00.000Z', items: [{ id: 1, name: 'Panino', quantity: 2, note: 'senza cipolla' }], ...extra },
});

beforeEach(async () => { await db.pendingOrders.clear(); await db.printedOrders.clear(); });

test('elenca solo i rifiutati, con motivo, righe e (se noti) codice e totale', async () => {
  const withCode = await queue('failed', { client_order_id: 'abc' });
  await db.printedOrders.put({ clientOrderId: 'abc', sessionId: 1, order: { display_code: 'B7', total: 9 }, createdAt: Date.now(), pendingReprints: [] });
  await queue('failed');
  await queue('pending');

  const list = await listFailedOrders();
  assert.equal(list.length, 2);
  assert.deepEqual(list[0], { localId: withCode, error: 'Sessione chiusa', createdAt: '2026-10-03T20:00:00.000Z', displayCode: 'B7', total: 9, items: [{ name: 'Panino', quantity: 2, note: 'senza cipolla' }] });
  assert.equal(list[1].displayCode, null);
});

test('riprova rimette l\'ordine in coda senza il vecchio errore; elimina lo toglie dalla coda', async () => {
  const a = await queue('failed');
  const b = await queue('failed');
  assert.equal(await countByStatus('failed'), 2);

  await retryFailedOrder(a);
  assert.equal((await db.pendingOrders.get(a)).status, 'pending');
  assert.equal((await db.pendingOrders.get(a)).error, undefined);

  await discardFailedOrder(b);
  assert.equal(await db.pendingOrders.get(b), undefined);
  assert.equal(await countByStatus('failed'), 0);
  assert.equal((await listFailedOrders()).length, 0);
});

test('riprovare o eliminare un ordine non rifiutato non fa nulla', async () => {
  const p = await queue('pending');
  await discardFailedOrder(p);
  await retryFailedOrder(p);
  assert.equal((await db.pendingOrders.get(p)).status, 'pending');
});
