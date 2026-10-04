// Coperto sul conto (passo 2-9): impostazione, riga automatica, coperti modificabili, pagamento e statistiche.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import { startServer, createTenant, deleteTenants, closePools, apiClient, adminDb, PASSWORD } from './helpers.js';

describe('coperto', () => {
  let server, t, admin, cashier, tables;

  const setCharge = (value, api = admin) => api.put('/settings/cover_charge', { value });
  const open = async (i, covers) => (await admin.post('/checks', { table_id: tables[i].id, covers })).body;
  const detail = async (id) => (await admin.get(`/checks/${id}`)).body;
  const coverOrder = (d) => d.orders.find(o => o.order_type === 'cover' && o.status !== 'canceled');

  before(async () => {
    server = await startServer();
    t = await createTenant({ businessType: 'ristorante' });
    admin = apiClient(server.port, t.host);
    await admin.login(t.username);
    await adminDb.query(`INSERT INTO users (username, password_hash, role, tenant_id) VALUES ($1, $2, 'cassa', $3)`, [`cassa-${t.slug}`, await bcrypt.hash(PASSWORD, 4), t.id]);
    cashier = apiClient(server.port, t.host);
    await cashier.login(`cassa-${t.slug}`);
    const room = (await admin.post('/rooms', { name: 'Sala' })).body;
    tables = (await admin.post(`/rooms/${room.id}/tables/bulk`, { prefix: 'T', from: 1, to: 14 })).body.created;
  });
  after(async () => {
    await deleteTenants(t);
    await server.close();
    await closePools();
  });

  it('senza coperto impostato il conto non ha righe di coperto', async () => {
    const check = await open(0, 4);
    const d = await detail(check.id);
    assert.deepEqual([d.total, d.orders.length], [0, 0]);
  });

  it('l\'impostazione: solo l\'admin, importo valido, salvato col punto', async () => {
    assert.equal((await setCharge('2,5', cashier)).status, 403);
    for (const bad of ['abc', '-1', '101', '2.555', '1,2,3']) assert.equal((await setCharge(bad)).status, 400, bad);
    assert.equal((await setCharge('2,5')).body.value, '2.50');
    assert.equal((await admin.get('/settings/all')).body.cover_charge, '2.50');
  });

  it('all\'apertura il coperto diventa una riga del conto: coperti × prezzo, già servita', async () => {
    const check = await open(1, 4);
    assert.equal(check.total, 10);
    const d = await detail(check.id);
    const cover = coverOrder(d);
    assert.deepEqual([cover.status, cover.total, cover.display_code], ['completed', 10, 'COP']);
    assert.deepEqual([cover.items[0].name, cover.items[0].quantity, cover.items[0].line_total], ['Coperto', 4, 10]);
  });

  it('cambiare i coperti adegua la riga; con zero coperti sparisce, poi ritorna', async () => {
    const id = (await open(2, 2)).id;
    assert.equal((await admin.post(`/checks/${id}/covers`, { covers: 6 })).body.total, 15);
    const d = await detail(id);
    assert.equal(d.covers, 6);
    assert.equal(d.orders.filter(o => o.order_type === 'cover').length, 1, 'sempre una sola riga di coperto');
    assert.equal((await admin.post(`/checks/${id}/covers`, { covers: 0 })).body.total, 0);
    assert.equal(coverOrder(await detail(id)), undefined);
    assert.equal((await admin.post(`/checks/${id}/covers`, { covers: 3 })).body.total, 7.5);
    assert.equal((await admin.post(`/checks/${id}/covers`, { covers: 100 })).status, 400);
    assert.equal((await admin.post(`/checks/999999999/covers`, { covers: 2 })).status, 404);
  });

  it('il prezzo si fissa all\'apertura: cambiare l\'impostazione non tocca i conti aperti', async () => {
    const old = await open(3, 2);
    await setCharge('5');
    const fresh = await open(4, 2);
    assert.equal(old.total, 5);
    assert.equal(fresh.total, 10);
    assert.equal((await admin.post(`/checks/${old.id}/covers`, { covers: 4 })).body.total, 10, 'resta 2,50 a persona');
    await setCharge('2.5');
  });

  it('il coperto non si storna a mano e non è una comanda: né cucina né conteggi', async () => {
    const check = await open(5, 2);
    const cover = coverOrder(await detail(check.id));
    const res = await admin.put(`/orders/${cover.id}`, { status: 'canceled' });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'COVER_ORDER');
    const kds = (await apiClient(server.port, t.host).get('/orders/kds')).body;
    assert.ok(!kds.some(o => o.display_code === 'COP'));
  });

  it('si paga come ogni voce, anche per voce; una volta pagato non cambia più', async () => {
    const check = await open(6, 2);
    const id = check.id;
    await admin.post('/orders', { items: [{ id: t.productId, name: 'Panino', quantity: 1 }], check_id: id });
    const d = await detail(id);
    assert.equal(d.total, 10, '5 di coperto + 5 di panino');
    const line = coverOrder(d).items[0];
    const paid = await admin.post(`/checks/${id}/payments`, { method: 'cash', items: [{ order_item_id: line.line_id, quantity: 1 }] });
    assert.equal(paid.body.payment.amount, 2.5, 'un coperto su due');
    assert.equal((await admin.post(`/checks/${id}/covers`, { covers: 3 })).body.code, 'COVER_PAID');
    assert.equal((await detail(id)).covers, 2, 'nulla è cambiato');
  });

  it('i coperti non scendono sotto il già pagato', async () => {
    const id = (await open(7, 4)).id;                                       // coperto 10
    await admin.post(`/checks/${id}/payments`, { method: 'cash', amount: 8 });
    const res = await admin.post(`/checks/${id}/covers`, { covers: 1 });    // scenderebbe a 2,5 < 8
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'ORDER_PAID');
    assert.equal((await detail(id)).total, 10);
  });

  it('è incasso a conto pagato, ma non è una comanda nelle statistiche', async () => {
    const id = (await open(8, 2)).id;                                       // coperto 5
    await admin.post('/orders', { items: [{ id: t.productId, name: 'Panino', quantity: 1 }], check_id: id });
    const before = (await admin.get(`/stats?sessions=${t.sessionId}&tz=Europe/Rome`)).body;
    await admin.post(`/checks/${id}/payments`, { method: 'card', amount: 10 });
    const after = (await admin.get(`/stats?sessions=${t.sessionId}&tz=Europe/Rome`)).body;
    assert.equal(after.totaleSerata - before.totaleSerata, 10, 'coperto compreso');
    assert.equal(after.numeroTotaleOrdini - before.numeroTotaleOrdini, 1, 'una sola comanda vera');
  });

  it('omaggio sul coperto, e l\'unione somma i coperti con un solo coperto', async () => {
    const id = (await open(9, 2)).id;
    const line = coverOrder(await detail(id)).items[0];
    assert.equal((await admin.post(`/checks/${id}/adjust`, { order_item_ids: [line.line_id], type: 'gift' })).body.total, 0);
    assert.equal(coverOrder(await detail(id)).order_type, 'cover', 'resta un coperto, omaggiato');

    const [a, b] = [(await open(10, 2)).id, (await open(11, 3)).id];
    const merged = await admin.post(`/checks/${a}/merge`, { into: b });
    assert.equal(merged.status, 200, JSON.stringify(merged.body));
    const d = await detail(b);
    assert.equal(d.covers, 5);
    assert.equal(d.total, 12.5);
    assert.equal(d.orders.filter(o => o.order_type === 'cover' && o.status !== 'canceled').length, 1);
    assert.equal((await detail(a)).total, 0);
  });

  it('un conto vuoto con il solo coperto si annulla senza eliminare comande; la cassa cambia i coperti', async () => {
    const id = (await open(12, 2)).id;
    assert.equal((await cashier.post(`/checks/${id}/covers`, { covers: 3 })).status, 200);
    const voided = await admin.post(`/checks/${id}/void`, {});
    assert.equal(voided.status, 200, JSON.stringify(voided.body));
    assert.equal(voided.body.status, 'void');
    assert.equal(coverOrder(await detail(id)), undefined, 'anche il coperto è annullato');
  });
});
