// Stampa offline-first contro una stampante Epson simulata (scripts/mock-epos.js) e un IndexedDB finto:
// coda con ritentativi, ristampa dall'archivio locale e audit in differita.
import 'fake-indexeddb/auto';
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = new EventTarget(); // la coda notifica le modifiche con eventi di window
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // il certificato della stampante simulata è autofirmato

const { db } = await import('../offline/db.js');
const { startMockEpos } = await import('../../scripts/mock-epos.js');
const { DEFAULT_BRANDING } = await import('./templates.js');
const { buildPrintJobs } = await import('./print.js');
const { enqueuePrintJobs, flushPrintQueue, countPrintJobs, discardPrintJobs } = await import('./queue.js');
const { saveLocalOrder, recentLocalOrders, syncReprintAudits } = await import('./localOrders.js');
const { reprintFromLocal } = await import('./reprint.js');

const ctx = { branding: { ...DEFAULT_BRANDING, name: 'PRO LOCO PROVA' }, images: { logo: () => null, numberBanner: () => null }, showLogo: true };
const order = (code, extra = {}) => ({
  id: code, display_code: code, created_at: '2026-10-03T14:05:09', total: 9.5, is_takeaway: false,
  items: [{ id: 1, name: 'Panino', quantity: 1, price: 5, print_destination: 'kitchen' }, { id: 2, name: 'Birra', quantity: 1, price: 4.5, print_destination: 'bar' }],
  ...extra,
});

let printer;
let config;
const queueOrder = async (code, key = `key-${code}`) => {
  const jobs = await buildPrintJobs(config.settings, order(code), ctx);
  await enqueuePrintJobs(jobs, key, code);
};

before(async () => {
  printer = await startMockEpos();
  config = {
    branding: ctx.branding,
    settings: [
      { copy_type: 'Cliente', printer_address: `localhost:${printer.port}`, enabled: true },
      { copy_type: 'Cucina', printer_address: `localhost:${printer.port}`, enabled: true },
    ],
  };
});

after(async () => { await printer.close(); db.close(); });

beforeEach(async () => {
  printer.failWith = null;
  printer.jobs.length = 0;
  await Promise.all([db.printJobs.clear(), db.printedOrders.clear()]);
});

test('una copia per stampante: Cliente e Cucina sulla stessa stampante arrivano in una sola richiesta', async () => {
  await queueOrder('A1');
  assert.equal(await countPrintJobs(), 1);
  assert.deepEqual(await flushPrintQueue(), []);
  assert.equal(await countPrintJobs(), 0);
  assert.equal(printer.jobs.length, 1);
  assert.match(printer.jobs[0].receipt, /PRO LOCO PROVA/);
  assert.match(printer.jobs[0].receipt, /COPIA CUCINA/);
  assert.match(printer.jobs[0].receipt, /ORD0000A1/);
});

test('lo stesso ordine non si accoda due volte', async () => {
  await queueOrder('A2', 'stesso-ordine');
  await queueOrder('A2', 'stesso-ordine');
  assert.equal(await countPrintJobs(), 1);
});

test('stampante che rifiuta (coperchio aperto): il lavoro resta in coda, si avvisa una volta sola, poi stampa', async () => {
  await queueOrder('A3');
  printer.failWith = 'EPTR_COVER_OPEN';

  const first = await flushPrintQueue();
  assert.equal(first.length, 1);
  assert.match(first[0].error, /EPTR_COVER_OPEN/);
  assert.equal(await countPrintJobs(), 1);

  assert.deepEqual(await flushPrintQueue(), []); // già segnalato: nessun nuovo avviso
  assert.equal((await db.printJobs.toArray())[0].attempts, 2);
  assert.equal(printer.jobs.length, 0);

  printer.failWith = null; // coperchio chiuso
  await flushPrintQueue();
  assert.equal(await countPrintJobs(), 0);
  assert.equal(printer.jobs.length, 1);
});

test('stampante spenta o irraggiungibile: nessun lavoro perso, stampa quando torna', async () => {
  await queueOrder('A4');
  const { port } = printer;
  await printer.close();
  const failed = await flushPrintQueue();
  assert.equal(failed.length, 1);
  assert.match(failed[0].error, /non raggiungibile/);
  assert.equal(await countPrintJobs(), 1);

  printer = await startMockEpos({ port });
  await flushPrintQueue();
  assert.equal(await countPrintJobs(), 0);
  assert.equal(printer.jobs.length, 1);
});

test('ristampa offline dall\'archivio locale: stessa copia, audit annotato e poi comunicato al server', async () => {
  await saveLocalOrder('uuid-1', 7, order('B5'));
  assert.deepEqual((await recentLocalOrders(7)).map(o => o.display_code), ['B5']);
  assert.deepEqual(await recentLocalOrders(8), []); // un'altra sessione non compare

  assert.equal(await reprintFromLocal('uuid-1', config), 1);
  await flushPrintQueue();
  assert.equal(printer.jobs.length, 1);
  assert.match(printer.jobs[0].receipt, /ORD0000B5/);
  assert.equal((await db.printedOrders.get('uuid-1')).pendingReprints.length, 1);

  assert.equal(await reprintFromLocal('inesistente', config), 0);
  assert.equal(await reprintFromLocal('uuid-1', null), 0);

  const sent = [];
  const notSynced = Object.assign(new Error('Ordine non ancora sincronizzato'), { status: 404 });
  await syncReprintAudits(async (body) => { sent.push(body); throw notSynced; });
  assert.equal((await db.printedOrders.get('uuid-1')).pendingReprints.length, 1); // resta da comunicare

  await syncReprintAudits(async (body) => { sent.push(body); });
  assert.equal(sent.at(-1).client_order_id, 'uuid-1');
  assert.equal(sent.at(-1).reprinted_at.length, 1);
  assert.equal((await db.printedOrders.get('uuid-1')).pendingReprints.length, 0);
});

test('un errore di rete durante l\'audit ferma il giro senza perdere le ristampe', async () => {
  await saveLocalOrder('uuid-2', 7, order('B6'));
  await reprintFromLocal('uuid-2', config);
  await syncReprintAudits(async () => { throw new Error('Server non raggiungibile'); });
  assert.equal((await db.printedOrders.get('uuid-2')).pendingReprints.length, 1);
});

test('l\'archivio tiene gli ultimi 100 ordini ma non scarta quelli con ristampe da comunicare', async () => {
  await saveLocalOrder('vecchio', 7, order('A1'));
  await reprintFromLocal('vecchio', config);
  for (let i = 0; i < 101; i++) await saveLocalOrder(`o-${i}`, 7, order(`C${i}`));
  assert.ok(await db.printedOrders.get('vecchio'), 'ordine con audit in sospeso conservato');
  assert.equal(await db.printedOrders.get('o-0') === undefined, true, 'il più vecchio senza audit è stato scartato');
  await discardPrintJobs();
  assert.equal(await countPrintJobs(), 0);
});
