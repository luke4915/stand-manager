// Stato per riga (passo 3-3): cucina e bar fanno avanzare, il cameriere serve; la comanda segue le righe.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import { startServer, createTenant, deleteTenants, closePools, apiClient, adminDb, connectWs, sleep, PASSWORD } from './helpers.js';

describe('stato per riga', () => {
  let server, t, sagra, admin, kitchen, waiter, sagraApi, tables, beer, starter;

  const user = async (role) => {
    const username = `${role}-${t.slug}`;
    await adminDb.query(`INSERT INTO users (username, password_hash, role, tenant_id) VALUES ($1, $2, $3, $4)`, [username, await bcrypt.hash(PASSWORD, 4), role, t.id]);
    const api = apiClient(server.port, t.host);
    await api.login(username);
    return api;
  };
  const openCheck = async (table) => (await admin.post('/checks', { table_id: table.id, covers: 2 })).body.id;
  // Una comanda mista: 2 panini (cucina) e una birra (bar), subito in cucina
  const mixed = async (table) => {
    const check = await openCheck(table);
    const res = await admin.post(`/checks/${check}/courses`, { groups: [{ course_id: starter.id, seq: 1, items: [{ id: t.productId, name: 'x', quantity: 2 }, { id: beer, name: 'x', quantity: 1 }] }] });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return { check, order: res.body.orders[0], lines: res.body.orders[0].items };
  };
  const dbStatus = async (orderId) => (await adminDb.query('SELECT status, completed_at FROM orders WHERE id = $1', [orderId])).rows[0];
  const put = (api, orderId, body) => api.put(`/orders/${orderId}/lines`, body);

  before(async () => {
    server = await startServer();
    [t, sagra] = [await createTenant({ businessType: 'ristorante' }), await createTenant()];
    admin = apiClient(server.port, t.host);
    await admin.login(t.username);
    sagraApi = apiClient(server.port, sagra.host);
    await sagraApi.login(sagra.username);
    kitchen = await user('cucina');
    waiter = await user('cassa');
    ({ rows: [{ id: beer }] } = await adminDb.query(`INSERT INTO products (name, price, category, print_destination, tenant_id) VALUES ('Birra', 4, 'Bevande', 'bar', $1) RETURNING id`, [t.id]));
    await adminDb.query(`UPDATE products SET print_destination = 'kitchen' WHERE id = $1`, [t.productId]);
    const room = (await admin.post('/rooms', { name: 'Sala' })).body;
    tables = (await admin.post(`/rooms/${room.id}/tables/bulk`, { prefix: 'T', from: 1, to: 6 })).body.created;
    starter = (await admin.post('/courses', { name: 'Antipasti' })).body;
  });
  after(async () => {
    await deleteTenants(t, sagra);
    await server.close();
    await closePools();
  });

  it('le righe nascono nuove, con il loro id e la postazione dal prodotto', async () => {
    const { lines } = await mixed(tables[0]);
    assert.deepEqual(lines.map(l => l.prep_status), ['new', 'new']);
    assert.ok(lines.every(l => l.line_id > 0));
    assert.deepEqual(lines.map(l => l.print_destination), ['kitchen', 'bar']);
  });

  it('la comanda segue le righe: in preparazione appena una parte, completata solo con tutte pronte', async () => {
    const { order } = await mixed(tables[1]);
    const res = await put(kitchen, order.id, { status: 'preparing', station: 'kitchen' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body.items.map(i => i.prep_status), ['preparing', 'new'], 'solo la riga della cucina');
    assert.equal(res.body.status, 'preparing');

    assert.equal((await put(kitchen, order.id, { status: 'ready', station: 'kitchen' })).body.status, 'preparing', 'il bar non ha finito');
    const done = await put(kitchen, order.id, { status: 'ready', station: 'bar' });
    assert.equal(done.body.status, 'completed');
    const row = await dbStatus(order.id);
    assert.equal(row.status, 'completed');
    assert.ok(row.completed_at);

    // un tocco sbagliato si corregge: la comanda torna in preparazione
    const undo = await put(kitchen, order.id, { status: 'preparing', station: 'bar' });
    assert.equal(undo.body.status, 'preparing');
    assert.equal((await dbStatus(order.id)).completed_at, null);
  });

  it('si può agire su singole righe; una riga di un\'altra comanda non esiste', async () => {
    const { order, lines } = await mixed(tables[2]);
    const one = await put(kitchen, order.id, { status: 'ready', line_ids: [lines[0].line_id] });
    assert.deepEqual(one.body.items.map(i => i.prep_status), ['ready', 'new']);
    const other = await mixed(tables[3]);
    const bad = await put(kitchen, order.id, { status: 'ready', line_ids: [other.lines[0].line_id] });
    assert.equal(bad.status, 404);
    assert.equal(bad.body.code, 'LINE_NOT_FOUND');
    assert.equal((await put(kitchen, order.id, { status: 'ready', line_ids: [] })).status, 400);
    assert.equal((await put(kitchen, order.id, { status: 'cotta' })).status, 400);
    assert.equal((await put(kitchen, 999999999, { status: 'ready' })).status, 404);
  });

  it('servire: solo la sala; la cucina non tocca una riga servita', async () => {
    const { check, order } = await mixed(tables[4]);
    await put(kitchen, order.id, { status: 'ready' });
    assert.equal((await admin.get(`/checks/${check}`)).body.ready_items, 2, 'due righe pronte da servire');

    const denied = await put(kitchen, order.id, { status: 'served' });
    assert.equal(denied.status, 403);
    const served = await put(waiter, order.id, { status: 'served', station: 'bar' });
    assert.equal(served.status, 200);
    assert.deepEqual(served.body.items.map(i => i.prep_status), ['ready', 'served']);
    assert.equal(served.body.status, 'completed');
    assert.equal((await admin.get(`/checks/${check}`)).body.ready_items, 1);

    await put(waiter, order.id, { status: 'served', station: 'kitchen' });
    const locked = await put(kitchen, order.id, { status: 'preparing' });
    assert.equal(locked.status, 403);
    assert.equal(locked.body.code, 'LINE_SERVED');
    assert.equal((await admin.get(`/checks/${check}`)).body.ready_items, 0);
  });

  it('non si toccano comande stornate o da mandare; un altro locale non le vede', async () => {
    const check = await openCheck(tables[5]);
    const [first, later] = (await admin.post(`/checks/${check}/courses`, { groups: [
      { course_id: starter.id, seq: 1, items: [{ id: t.productId, name: 'x', quantity: 1 }] },
      { course_id: null, seq: 2, items: [{ id: t.productId, name: 'x', quantity: 1 }] },
    ] })).body.orders;
    const early = await put(kitchen, later.id, { status: 'ready' });
    assert.equal(early.status, 409);
    assert.equal(early.body.code, 'ORDER_SCHEDULED');
    await admin.put(`/orders/${first.id}`, { status: 'canceled' });
    const gone = await put(kitchen, first.id, { status: 'ready' });
    assert.equal(gone.status, 409);
    assert.equal(gone.body.code, 'ORDER_CANCELED');
    assert.equal((await put(sagraApi, first.id, { status: 'ready' })).status, 404, 'un altro locale non la vede');
  });

  it('il vecchio PUT di stato (sagre) tiene allineate le righe', async () => {
    const res = await sagraApi.post('/orders', { items: [{ id: sagra.productId, name: 'x', quantity: 1 }] });
    const id = res.body.orderId;
    await sagraApi.put(`/orders/${id}`, { status: 'preparing' });
    assert.deepEqual((await adminDb.query('SELECT prep_status FROM order_items WHERE order_id = $1', [id])).rows.map(r => r.prep_status), ['preparing']);
    await sagraApi.put(`/orders/${id}`, { status: 'completed' });
    assert.deepEqual((await adminDb.query('SELECT prep_status FROM order_items WHERE order_id = $1', [id])).rows.map(r => r.prep_status), ['ready']);
  });

  it('eventi: ogni cambio arriva al personale come comanda e conto aggiornati', async () => {
    const staff = await connectWs(server.port, t.host, { cookie: admin.cookie });
    const { order } = await mixed((await admin.post(`/rooms/${(await admin.get('/rooms')).body[0].id}/tables`, { name: 'X1' })).body);
    await sleep(100);
    staff.messages.length = 0;
    await put(kitchen, order.id, { status: 'ready', station: 'kitchen' });
    await sleep(120);
    const updated = staff.messages.find(m => m.type === 'order_updated');
    assert.deepEqual(updated.order.items.map(i => i.prep_status), ['ready', 'new']);
    assert.equal(staff.messages.filter(m => m.type === 'check_updated').pop().check.ready_items, 1);
    staff.messages.length = 0;
    await put(kitchen, order.id, { status: 'ready', station: 'kitchen' });
    await sleep(100);
    assert.deepEqual(staff.types(), [], 'niente cambia, niente eventi');
    staff.ws.close();
  });
});
