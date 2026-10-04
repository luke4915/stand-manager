// L'incasso conosce i conti dei tavoli (passo 2-3): statistiche, contanti attesi, CSV e chiusura del servizio.
// Gli ordini senza conto restano esattamente come prima (le sagre non cambiano).
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { toOrderItemRows } from '../../utils/orderItems.js';
import { insertOrderItemRows } from '../../utils/orderItemsWrite.js';
import { startServer, createTenant, deleteTenants, closePools, apiClient, adminDb } from './helpers.js';

describe('incasso con i conti dei tavoli', () => {
  let server, t, admin, room, tables;

  const addOrder = async ({ total, status = 'completed', checkId = null }) => {
    const { rows: [o] } = await adminDb.query(
      `INSERT INTO orders (total, status, session_id, tenant_id, order_type, check_id) VALUES ($1, $2, $3, $4, 'sale', $5) RETURNING id`,
      [total, status, t.sessionId, t.id, checkId]);
    const item = { id: t.productId, name: 'Pizza', quantity: 1, price: total, line_total: total, category: 'Cibo' };
    await insertOrderItemRows(adminDb, t.id, toOrderItemRows([item]).rows.map(r => ({ ...r, order_id: o.id })));
    return o.id;
  };
  const openCheck = async (table) => (await admin.post('/checks', { table_id: table.id, covers: 2 })).body.id;
  const pay = (checkId, method, amount) =>
    adminDb.query('INSERT INTO payments (tenant_id, check_id, method, amount) VALUES ($1, $2, $3, $4)', [t.id, checkId, method, amount]);
  const settle = (checkId) => adminDb.query(`UPDATE checks SET status = 'paid', closed_at = now() WHERE id = $1`, [checkId]);
  const stats = async () => (await admin.get(`/stats?sessions=${t.sessionId}&tz=Europe/Rome`)).body;
  const expected = async () => (await admin.get('/sessions/expected-cash')).body;

  before(async () => {
    server = await startServer();
    t = await createTenant({ businessType: 'ristorante' });
    admin = apiClient(server.port, t.host);
    await admin.login(t.username);
    room = (await admin.post('/rooms', { name: 'Sala' })).body;
    tables = (await admin.post(`/rooms/${room.id}/tables/bulk`, { prefix: 'T', from: 1, to: 4 })).body.created;
  });
  after(async () => {
    await deleteTenants(t);
    await server.close();
    await closePools();
  });

  it('un ordine pagato subito conta come sempre', async () => {
    await addOrder({ total: 10 });
    await addOrder({ total: 99, status: 'pending' });
    assert.equal((await stats()).totaleSerata, 10);
    assert.equal((await expected()).expected, 10);
  });

  it('le comande di un conto aperto non sono incasso, anche se servite', async () => {
    const c1 = await openCheck(tables[0]);
    await addOrder({ total: 40, checkId: c1 });
    assert.equal((await stats()).totaleSerata, 10);
    assert.equal((await expected()).expected, 10);
    assert.equal((await admin.get(`/checks/${c1}`)).body.total, 40);
  });

  it('un pagamento in contanti su un conto ancora aperto è già nel cassetto, ma non è incasso', async () => {
    const [c1] = (await admin.get('/checks?status=open')).body.map(c => c.id);
    await pay(c1, 'cash', 15);
    assert.equal((await expected()).expected, 25, '10 pagati subito + 15 in contanti');
    assert.equal((await stats()).totaleSerata, 10);
    const summary = (await admin.get(`/checks/${c1}`)).body;
    assert.deepEqual([summary.paid, summary.due], [15, 25]);
  });

  it('a conto pagato le comande diventano incasso; la carta è incasso ma non contanti', async () => {
    const c1 = (await admin.get('/checks?status=open')).body[0].id;
    await addOrder({ total: 7, status: 'canceled', checkId: c1 });
    await pay(c1, 'card', 25);
    await settle(c1);
    assert.equal((await stats()).totaleSerata, 50, '10 + 40 (la comanda annullata non conta)');
    assert.equal((await expected()).expected, 25, 'la carta non entra nel cassetto');
  });

  it('il CSV di sessione include le comande dei conti pagati', async () => {
    const res = await admin.request('GET', `/exports/session/${t.sessionId}/csv`);
    assert.equal(res.status, 200);
    const rows = String(res.body ?? res.text).split('\n').filter(Boolean).length - 1;
    assert.equal(rows, 2, 'ordine pagato subito + comanda del conto pagato');
  });

  it('un conto aperto blocca la chiusura del servizio', async () => {
    const c2 = await openCheck(tables[1]);
    await addOrder({ total: 12, status: 'pending', checkId: c2 });
    const info = await expected();
    assert.deepEqual([info.openChecks, info.openChecksTotal], [1, 12]);
    assert.equal(info.openOrders, 1, 'solo l\'ordine pagato subito ancora in attesa: le comande dei tavoli le tiene il conto');

    const blocked = await admin.post('/sessions/end', { declaredCash: 25 });
    assert.equal(blocked.status, 409);
    assert.equal(blocked.body.code, 'OPEN_CHECKS');
    assert.equal((await admin.post('/sessions/end', { declaredCash: 25, openOrders: 'leave' })).status, 409, 'non si può lasciare fuori');
    assert.ok((await admin.get('/sessions/latest')).body.end_time == null, 'il servizio è ancora aperto');

    await settle(c2);
    const ended = await admin.post('/sessions/end', { declaredCash: 25, openOrders: 'leave' });
    assert.equal(ended.status, 200, JSON.stringify(ended.body));
    assert.equal(Number(ended.body.expected_cash), 25);
  });

  it('un conto annullato non blocca nulla né fa incasso', async () => {
    const { rows: [s] } = await adminDb.query(`INSERT INTO sessions (name, start_time, tenant_id) VALUES ('Cena', now(), $1) RETURNING id`, [t.id]);
    const c = (await admin.post('/checks', { table_id: tables[2].id, covers: 1 })).body.id;
    assert.equal((await admin.post(`/checks/${c}/void`)).status, 200);
    assert.equal((await admin.post('/sessions/end', { declaredCash: 0 })).status, 200);
    assert.ok(s.id);
  });
});
