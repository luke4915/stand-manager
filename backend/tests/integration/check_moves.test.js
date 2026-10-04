// Spostare un conto su un altro tavolo e unire due conti (passo 2-7).
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import { startServer, createTenant, deleteTenants, closePools, apiClient, adminDb, connectWs, sleep, PASSWORD } from './helpers.js';

describe('spostare e unire i conti', () => {
  let server, t, other, admin, kitchen, otherAdmin, tables, otherTable;

  const open = async (i, covers = 2) => (await admin.post('/checks', { table_id: tables[i].id, covers })).body.id;
  const order = (check, quantity = 1) => admin.post('/orders', { items: [{ id: t.productId, name: 'Panino', quantity }], check_id: check });
  const detail = async (id) => (await admin.get(`/checks/${id}`)).body;

  before(async () => {
    server = await startServer();
    [t, other] = [await createTenant({ businessType: 'ristorante' }), await createTenant({ businessType: 'ristorante' })];
    admin = apiClient(server.port, t.host);
    await admin.login(t.username);
    otherAdmin = apiClient(server.port, other.host);
    await otherAdmin.login(other.username);
    await adminDb.query(`INSERT INTO users (username, password_hash, role, tenant_id) VALUES ($1, $2, 'cucina', $3)`, [`cucina-${t.slug}`, await bcrypt.hash(PASSWORD, 4), t.id]);
    kitchen = apiClient(server.port, t.host);
    await kitchen.login(`cucina-${t.slug}`);
    const room = (await admin.post('/rooms', { name: 'Sala' })).body;
    tables = (await admin.post(`/rooms/${room.id}/tables/bulk`, { prefix: 'T', from: 1, to: 12 })).body.created;
    const room2 = (await otherAdmin.post('/rooms', { name: 'Sala' })).body;
    otherTable = (await otherAdmin.post(`/rooms/${room2.id}/tables`, { name: 'X1' })).body;
  });
  after(async () => {
    await deleteTenants(t, other);
    await server.close();
    await closePools();
  });

  it('sposta il conto su un tavolo libero: il vecchio si libera, comande e totale restano, la cucina vede il tavolo nuovo', async () => {
    const check = await open(0, 3);
    await order(check, 2);
    const staff = await connectWs(server.port, t.host, { cookie: admin.cookie });
    const kds = await connectWs(server.port, t.host, { publicKds: true });

    const moved = await admin.post(`/checks/${check}/move`, { table_id: tables[1].id });
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
    assert.deepEqual([moved.body.table_name, moved.body.covers, moved.body.total], ['T2', 3, 10]);
    assert.equal((await admin.get(`/checks?table_id=${tables[0].id}`)).body.length, 0, 'T1 è libero');
    assert.equal((await admin.post('/checks', { table_id: tables[0].id, covers: 1 })).status, 201);

    const listed = (await admin.get('/orders?session=active')).body.find(o => o.check_id === check);
    assert.equal(listed.table_name, 'T2');
    await sleep(100);
    assert.equal(staff.messages.find(m => m.type === 'order_updated').order.table_name, 'T2');
    assert.equal(kds.messages.find(m => m.type === 'order_updated').order.table_name, 'T2');
    staff.ws.close(); kds.ws.close();
  });

  it('regole dello spostamento', async () => {
    const check = await open(2);
    const busy = await open(3);
    const res = await admin.post(`/checks/${check}/move`, { table_id: tables[3].id });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'TABLE_BUSY');
    assert.equal((await detail(check)).table_name, 'T3', 'nulla è cambiato');

    assert.equal((await admin.post(`/checks/${check}/move`, { table_id: tables[2].id })).body.code, 'SAME_TABLE');
    await admin.put(`/tables/${tables[4].id}`, { active: false });
    assert.equal((await admin.post(`/checks/${check}/move`, { table_id: tables[4].id })).body.code, 'TABLE_INACTIVE');
    assert.equal((await admin.post(`/checks/${check}/move`, { table_id: 999999999 })).status, 404);
    assert.equal((await admin.post(`/checks/${check}/move`, { table_id: otherTable.id })).status, 404, 'tavolo di un altro locale');
    assert.equal((await admin.post(`/checks/999999999/move`, { table_id: tables[5].id })).status, 404);
    assert.equal((await kitchen.post(`/checks/${check}/move`, { table_id: tables[5].id })).status, 403);
    assert.equal((await otherAdmin.post(`/checks/${check}/move`, { table_id: otherTable.id })).status, 404, 'conto di un altro locale');

    await admin.post(`/checks/${busy}/void`, {});
    await admin.post(`/checks/${busy}/void`, {});   // già annullato
    assert.equal((await admin.post(`/checks/${busy}/move`, { table_id: tables[5].id })).body.code, 'CHECK_CLOSED');
  });

  it('due spostamenti verso lo stesso tavolo: ne riesce uno solo', async () => {
    const [a, b] = [await open(6), await open(7)];
    const results = await Promise.all([admin.post(`/checks/${a}/move`, { table_id: tables[8].id }), admin.post(`/checks/${b}/move`, { table_id: tables[8].id })]);
    assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  });

  it('unisce due conti: comande, pagamenti e coperti confluiscono, il conto assorbito resta in archivio', async () => {
    const [a, b] = [await open(9, 2), await open(10, 3)];
    await order(a, 1);   // 5
    await order(b, 2);   // 10
    await admin.post(`/checks/${a}/payments`, { method: 'cash', amount: 2 });
    await admin.post(`/checks/${a}/bill-request`, { requested: true });

    const merged = await admin.post(`/checks/${a}/merge`, { into: b });
    assert.equal(merged.status, 200, JSON.stringify(merged.body));
    const target = await detail(b);
    assert.deepEqual([target.covers, target.total, target.paid, target.due, target.orders.length, target.payments.length], [5, 15, 2, 13, 2, 1]);
    assert.ok(target.bill_requested_at, 'la richiesta del conto non si perde');

    const source = await detail(a);
    assert.deepEqual([source.status, source.merged_into, source.total, source.orders.length], ['void', b, 0, 0]);
    assert.equal((await admin.post('/checks', { table_id: tables[9].id, covers: 1 })).status, 201, 'il tavolo del conto assorbito è libero');
    assert.equal((await admin.post(`/orders`, { items: [{ id: t.productId, name: 'x', quantity: 1 }], check_id: a })).body.code, 'CHECK_CLOSED');

    // il conto unito si paga insieme ed è incasso per intero
    const before = (await admin.get(`/stats?sessions=${t.sessionId}&tz=Europe/Rome`)).body.totaleSerata;
    assert.equal((await admin.post(`/checks/${b}/payments`, { method: 'card', amount: 13 })).body.check.status, 'paid');
    assert.equal((await admin.get(`/stats?sessions=${t.sessionId}&tz=Europe/Rome`)).body.totaleSerata, before + 15);
  });

  it('regole dell\'unione', async () => {
    const [u1, u2, u3] = (await admin.post(`/rooms/${tables[0].room_id}/tables/bulk`, { prefix: 'U', from: 1, to: 3 })).body.created;
    const [a, closed] = [(await admin.post('/checks', { table_id: u1.id, covers: 1 })).body.id, (await admin.post('/checks', { table_id: u2.id, covers: 1 })).body.id];
    assert.ok(a && closed && u3);
    assert.equal((await admin.post(`/checks/${a}/merge`, { into: a })).body.code, 'SAME_CHECK');
    assert.equal((await admin.post(`/checks/${a}/merge`, { into: 999999999 })).status, 404);
    assert.equal((await admin.post(`/checks/${a}/merge`, { into: 0 })).status, 400);
    const foreign = (await otherAdmin.post('/checks', { table_id: otherTable.id, covers: 1 })).body.id;
    assert.equal((await admin.post(`/checks/${a}/merge`, { into: foreign })).status, 404, 'conto di un altro locale');
    assert.equal((await admin.post(`/checks/${foreign}/merge`, { into: a })).status, 404, 'e al contrario');
    assert.equal((await kitchen.post(`/checks/${a}/merge`, { into: closed })).status, 403);

    await admin.post(`/checks/${closed}/void`, {});
    assert.equal((await admin.post(`/checks/${a}/merge`, { into: closed })).body.code, 'CHECK_CLOSED');
    assert.equal((await admin.post(`/checks/${closed}/merge`, { into: a })).body.code, 'CHECK_CLOSED');
  });

  it('unioni opposte contemporanee: una riesce, l\'altra trova il conto chiuso, nessuno stallo', async () => {
    const free = (await admin.get('/rooms')).body[0].tables.filter(x => x.active);
    const used = new Set((await admin.get('/checks?status=open')).body.map(c => c.table_id));
    const [t1, t2] = free.filter(x => !used.has(x.id));
    const a = (await admin.post('/checks', { table_id: t1.id, covers: 1 })).body.id;
    const b = (await admin.post('/checks', { table_id: t2.id, covers: 1 })).body.id;
    const results = await Promise.all([admin.post(`/checks/${a}/merge`, { into: b }), admin.post(`/checks/${b}/merge`, { into: a })]);
    assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  });
});
