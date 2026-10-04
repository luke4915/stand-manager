// Comande su un conto (passo 2-4): POST /orders con check_id, tavolo e coperti per cucina e KDS, storni.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import { startServer, createTenant, deleteTenants, closePools, apiClient, adminDb, connectWs, sleep, PASSWORD } from './helpers.js';

describe('comande dei tavoli', () => {
  let server, t, sagra, admin, kitchen, sagraApi, tables;

  const order = (checkId, quantity = 1, extra = {}) =>
    admin.post('/orders', { items: [{ id: t.productId, name: 'Panino', quantity }], ...(checkId && { check_id: checkId }), ...extra });
  const openCheck = async (table, covers = 4) => (await admin.post('/checks', { table_id: table.id, covers })).body.id;
  const activeOrders = async () => (await admin.get('/orders?session=active')).body;

  before(async () => {
    server = await startServer();
    [t, sagra] = [await createTenant({ businessType: 'ristorante' }), await createTenant()];
    admin = apiClient(server.port, t.host);
    await admin.login(t.username);
    sagraApi = apiClient(server.port, sagra.host);
    await sagraApi.login(sagra.username);
    await adminDb.query(`INSERT INTO users (username, password_hash, role, tenant_id) VALUES ($1, $2, 'cucina', $3)`, [`cucina-${t.slug}`, await bcrypt.hash(PASSWORD, 4), t.id]);
    kitchen = apiClient(server.port, t.host);
    await kitchen.login(`cucina-${t.slug}`);
    const room = (await admin.post('/rooms', { name: 'Sala' })).body;
    tables = (await admin.post(`/rooms/${room.id}/tables/bulk`, { prefix: 'T', from: 1, to: 6 })).body.created;
  });
  after(async () => {
    await deleteTenants(t, sagra);
    await server.close();
    await closePools();
  });

  it('una comanda va sul conto, non è incasso e porta tavolo e coperti', async () => {
    const check = await openCheck(tables[0], 4);
    const res = await order(check, 2);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.checkId, check);

    const { rows: [row] } = await adminDb.query('SELECT check_id, status, display_code FROM orders WHERE id = $1', [res.body.orderId]);
    assert.equal(row.check_id, check);
    assert.equal(row.status, 'pending');

    const detail = (await admin.get(`/checks/${check}`)).body;
    assert.equal(detail.total, 10, '2 panini da 5 €: calcolato dal server');
    assert.equal(detail.orders.length, 1);
    assert.equal((await admin.get(`/stats?sessions=${t.sessionId}&tz=Europe/Rome`)).body.totaleSerata, 0, 'non incassato finché il conto non è pagato');

    const listed = (await activeOrders()).find(o => o.id === res.body.orderId);
    assert.deepEqual([listed.table_name, listed.covers, listed.check_number], ['T1', 4, 1]);
  });

  it('un ordine pagato subito non ha tavolo', async () => {
    const res = await order(null, 1);
    const listed = (await activeOrders()).find(o => o.id === res.body.orderId);
    assert.deepEqual([listed.check_id, listed.table_name, listed.covers], [null, null, null]);
  });

  it('più comande insieme sullo stesso conto: tutte entrano, con codici diversi', async () => {
    const check = await openCheck(tables[1], 2);
    const results = await Promise.all(Array.from({ length: 5 }, () => order(check, 1)));
    assert.ok(results.every(r => r.status === 200), JSON.stringify(results.map(r => r.body)));
    assert.equal(new Set(results.map(r => r.body.displayCode)).size, 5);
    assert.equal((await admin.get(`/checks/${check}`)).body.total, 25);
  });

  it('regole: conto inesistente, di un altro locale, chiuso, e campi non ammessi', async () => {
    assert.equal((await order(999999999)).status, 404);
    // il conto di un altro locale non esiste per questo (la RLS lo nasconde)
    const { rows: [foreign] } = await adminDb.query(
      `INSERT INTO checks (session_id, number, tenant_id) VALUES ($1, 1, $2) RETURNING id`, [sagra.sessionId, sagra.id]);
    assert.equal((await order(foreign.id)).status, 404);
    await adminDb.query('DELETE FROM checks WHERE id = $1', [foreign.id]);
    const closed = await openCheck(tables[2]);
    await admin.post(`/checks/${closed}/void`, {});
    const res = await order(closed);
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'CHECK_CLOSED');

    const check = await openCheck(tables[3]);
    assert.equal((await order(check, 1, { device_id: 1, device_seq: 1 })).status, 400, 'niente dispositivo');
    assert.equal((await order(check, 1, { session_id: t.sessionId, client_created_at: new Date().toISOString(), client_order_id: crypto.randomUUID() })).status, 400, 'niente invio in ritardo');
    assert.equal((await admin.post('/orders', { items: [{ id: t.productId, name: 'Panino', quantity: 1 }], check_id: 0 })).status, 400, 'check_id deve essere positivo');
  });

  it('un locale senza il modulo tavoli non accetta comande su conti', async () => {
    const res = await sagraApi.post('/orders', { items: [{ id: sagra.productId, name: 'Panino', quantity: 1 }], check_id: 1 });
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'MODULE_DISABLED');
  });

  it('lo stesso invio ripetuto non duplica la comanda', async () => {
    const check = await openCheck(tables[4]);
    const key = crypto.randomUUID();
    const first = await order(check, 1, { client_order_id: key });
    const again = await order(check, 1, { client_order_id: key });
    assert.equal(again.body.duplicate, true);
    assert.equal(again.body.orderId, first.body.orderId);
    assert.equal((await admin.get(`/checks/${check}`)).body.orders.length, 1);
  });

  it('il KDS pubblico vede tavolo e coperti, mai importi né conto', async () => {
    const kds = await admin.request('GET', '/orders/kds');
    assert.equal(kds.status, 200);
    const publicKds = apiClient(server.port, t.host);
    const res = await publicKds.get('/orders/kds');
    const withTable = res.body.find(o => o.table_name === 'T1');
    assert.ok(withTable);
    assert.equal(withTable.covers, 4);
    assert.ok(!('total' in withTable) && !('check_id' in withTable));
  });

  it('eventi: il personale riceve comanda e conto aggiornato, il KDS pubblico solo la comanda senza importi', async () => {
    const staff = await connectWs(server.port, t.host, { cookie: admin.cookie });
    const kds = await connectWs(server.port, t.host, { publicKds: true });
    const check = await openCheck(tables[5], 3);
    await order(check, 1);
    await sleep(120);
    const created = staff.messages.find(m => m.type === 'order_created');
    assert.equal(created.order.table_name, 'T6');
    assert.equal(created.order.covers, 3);
    const updated = staff.messages.filter(m => m.type === 'check_updated').pop();
    assert.equal(updated.check.total, 5);
    const publicCreated = kds.messages.find(m => m.type === 'order_created');
    assert.equal(publicCreated.order.table_name, 'T6');
    assert.ok(!('total' in publicCreated.order));
    assert.deepEqual(kds.types().filter(x => x !== 'order_created'), [], 'nessun dato del conto al KDS pubblico');
    staff.ws.close(); kds.ws.close();
  });

  it('storno: riduce il conto finché è aperto, si blocca a conto pagato; la cucina avanza lo stato', async () => {
    const check = await openCheck(tables[2]);
    const a = (await order(check, 1)).body.orderId;
    const b = (await order(check, 2)).body.orderId;
    assert.equal((await admin.get(`/checks/${check}`)).body.total, 15);
    assert.equal((await admin.put(`/orders/${a}`, { status: 'canceled' })).status, 200);
    assert.equal((await admin.get(`/checks/${check}`)).body.total, 10);

    const c = (await order(check, 1)).body.orderId;
    assert.equal((await kitchen.put(`/orders/${b}`, { status: 'preparing' })).status, 200);
    await adminDb.query(`UPDATE checks SET status = 'paid' WHERE id = $1`, [check]);
    assert.equal((await kitchen.put(`/orders/${b}`, { status: 'completed' })).status, 200, 'servire dopo il pagamento è lecito');
    const blocked = await admin.put(`/orders/${c}`, { status: 'canceled' });
    assert.equal(blocked.status, 409);
    assert.equal(blocked.body.code, 'CHECK_CLOSED');
    assert.equal((await admin.get(`/stats?sessions=${t.sessionId}&tz=Europe/Rome`)).body.totaleSerata, 15, 'ora è incasso: 10 (b) + 5 (c ancora attiva)');
  });

  it('a servizio chiuso non si inviano comande', async () => {
    const check = await openCheck(tables[3]);
    await adminDb.query('UPDATE sessions SET end_time = now() WHERE id = $1', [t.sessionId]);
    const res = await order(check);
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'NO_ACTIVE_SESSION');
  });
});
