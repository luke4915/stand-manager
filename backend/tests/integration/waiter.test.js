// Ruolo cameriere (passo 3-5): prende gli ordini ai tavoli, manda le portate e serve; non incassa, non storna, non fa sconti.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import { startServer, createTenant, deleteTenants, closePools, apiClient, adminDb, PASSWORD } from './helpers.js';

describe('ruolo cameriere', () => {
  let server, t, admin, waiter, tables, starter, main;

  const line = (quantity = 1) => ({ id: t.productId, name: 'x', quantity });
  const open = async (table, api = waiter) => (await api.post('/checks', { table_id: table.id, covers: 2 })).body.id;

  before(async () => {
    server = await startServer();
    t = await createTenant({ businessType: 'ristorante' });
    admin = apiClient(server.port, t.host);
    await admin.login(t.username);
    const username = `cameriere-${t.slug}`;
    await adminDb.query(`INSERT INTO users (username, password_hash, role, tenant_id) VALUES ($1, $2, 'cameriere', $3)`, [username, await bcrypt.hash(PASSWORD, 4), t.id]);
    waiter = apiClient(server.port, t.host);
    await waiter.login(username);
    const room = (await admin.post('/rooms', { name: 'Sala' })).body;
    tables = (await admin.post(`/rooms/${room.id}/tables/bulk`, { prefix: 'T', from: 1, to: 6 })).body.created;
    starter = (await admin.post('/courses', { name: 'Antipasti' })).body;
    main = (await admin.post('/courses', { name: 'Primi' })).body;
  });
  after(async () => {
    await deleteTenants(t);
    await server.close();
    await closePools();
  });

  it('l\'admin crea un utente cameriere e il login lo riconosce', async () => {
    const created = await admin.post('/auth/admin/createUser', { username: 'mario', password: 'temporanea1', role: 'cameriere' });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal((await adminDb.query(`SELECT role FROM users WHERE username = 'mario' AND tenant_id = $1`, [t.id])).rows[0].role, 'cameriere');
    const me = await waiter.get('/auth/me');
    assert.equal(me.body.role, 'cameriere');
    assert.equal((await admin.post('/auth/admin/createUser', { username: 'x', password: 'temporanea1', role: 'pizzaiolo' })).status, 400);
  });

  it('legge sale, portate, carta e servizio; non le modifica', async () => {
    assert.equal((await waiter.get('/rooms')).status, 200);
    assert.equal((await waiter.get('/courses')).status, 200);
    assert.equal((await waiter.get('/products')).status, 200);
    assert.equal((await waiter.get('/sessions/latest')).status, 200);
    assert.equal((await waiter.post('/rooms', { name: 'Nuova' })).status, 403);
    assert.equal((await waiter.post('/courses', { name: 'Dolci' })).status, 403);
    assert.equal((await waiter.put(`/rooms/${tables[0].room_id}/layout`, { grid_w: 10, grid_h: 10, tables: [] })).status, 403);
    assert.equal((await waiter.post('/products', { name: 'Y', price: 1, category: 'C' })).status, 403);
    assert.equal((await waiter.post('/sessions/start', { name: 'Cena' })).status, 403);
  });

  it('apre il tavolo, ordina per portate, manda e serve', async () => {
    const check = await open(tables[0]);
    assert.ok(check);
    const sent = await waiter.post(`/checks/${check}/courses`, { groups: [
      { course_id: starter.id, seq: 1, items: [line()] }, { course_id: main.id, seq: 2, items: [line(2)] },
    ] });
    assert.equal(sent.status, 201, JSON.stringify(sent.body));
    const [first, second] = sent.body.orders;
    assert.equal((await waiter.get(`/checks/${check}`)).status, 200);
    assert.equal((await waiter.get('/checks')).status, 200);

    assert.equal((await waiter.put(`/orders/${first.id}/lines`, { status: 'ready' })).status, 200);
    assert.equal((await waiter.put(`/orders/${first.id}/lines`, { status: 'served' })).status, 200, 'il cameriere serve');
    const fired = await waiter.post(`/checks/${check}/fire`, {});
    assert.deepEqual(fired.body.fired, [second.id]);
    assert.equal((await waiter.post(`/checks/${check}/bill-request`, { requested: true })).status, 200);
    assert.equal((await waiter.get(`/checks/${check}/receipt`)).status, 200, 'può stampare il conto');
    assert.equal((await waiter.post(`/checks/${check}/covers`, { covers: 3 })).status, 200);
    assert.equal((await waiter.post(`/checks/${check}/move`, { table_id: tables[1].id })).status, 200);
  });

  it('non incassa, non chiude, non unisce, non storna, non fa sconti né elimina conti', async () => {
    const check = await open(tables[2], admin);
    const other = await open(tables[3], admin);
    const sent = (await admin.post(`/checks/${check}/courses`, { groups: [{ course_id: null, seq: 1, items: [line()] }] })).body;
    const order = sent.orders[0];
    const lineId = order.items[0].line_id;

    assert.equal((await waiter.post(`/checks/${check}/payments`, { method: 'cash', amount: 1 })).status, 403);
    assert.equal((await waiter.post(`/checks/${check}/close`, {})).status, 403);
    assert.equal((await waiter.post(`/checks/${check}/merge`, { target_id: other })).status, 403);
    assert.equal((await waiter.post(`/checks/${check}/adjust`, { order_item_ids: [lineId], type: 'gift' })).status, 403);
    assert.equal((await waiter.post(`/checks/${check}/void`, { cancel_orders: true })).status, 403);
    assert.equal((await waiter.put(`/orders/${order.id}`, { status: 'canceled' })).status, 403, 'niente storni');
    assert.equal((await waiter.post('/orders', { items: [line()] })).status, 403, 'niente ordini pagati subito (cassa)');
    assert.equal((await waiter.request('PATCH', `/products/${t.productId}/stock`, { stock_enabled: true, stock: 5 })).status, 403);
    assert.equal((await waiter.post(`/orders/${order.id}/reprint`)).status, 403);

    const gift = await waiter.post(`/checks/${check}/courses`, { groups: [{ course_id: null, seq: 1, items: [{ ...line(), type: 'gift' }] }] });
    assert.equal(gift.status, 403, 'niente omaggi né sconti');
    assert.equal((await adminDb.query('SELECT COUNT(*)::int AS n FROM orders WHERE check_id = $1 AND order_type <> \'cover\'', [check])).rows[0].n, 1);
  });

  it('non vede le statistiche né gestisce gli utenti', async () => {
    assert.equal((await waiter.get(`/stats?sessions=${t.sessionId}&tz=Europe/Rome`)).status, 403);
    assert.equal((await waiter.get('/auth/admin/users')).status, 403);
  });
});
