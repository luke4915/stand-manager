// Conti dei tavoli: apertura (un solo conto aperto per tavolo, numeri in fila), totali calcolati dal server,
// richiesta del conto, annullo, ruoli, isolamento tra tenant e eventi in tempo reale.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { startServer, createTenant, deleteTenants, closePools, apiClient, adminDb, connectWs, sleep, PASSWORD } from './helpers.js';
import { toOrderItemRows } from '../../utils/orderItems.js';
import { insertOrderItemRows } from '../../utils/orderItemsWrite.js';

process.env.MASTER_JWT_SECRET ||= 'segreto-master-di-prova-lungo-almeno-32-caratteri';
const masterCookie = { cookie: `master_token=${jwt.sign({ master: true }, process.env.MASTER_JWT_SECRET)}` };

describe('conti dei tavoli', () => {
  let server, t1, t2, admin1, admin2, cashier, kitchen, master, room, tables, other;

  const enableTables = (t) => master.request('PUT', `/master/tenants/${t.id}/modules`, { businessType: 'ristorante', modules: ['kds', 'stats', 'tables'] }, masterCookie);
  const addUser = async (t, role) => {
    const username = `${role}-${t.slug}`;
    await adminDb.query(`INSERT INTO users (username, password_hash, role, tenant_id) VALUES ($1, $2, $3, $4)`, [username, await bcrypt.hash(PASSWORD, 4), role, t.id]);
    const api = apiClient(server.port, t.host);
    await api.login(username);
    return api;
  };
  // Una comanda del conto (ordine con righe), scritta come l'app.
  const addOrder = async (checkId, tenant, lines, { status = 'pending', total } = {}) => {
    const sum = lines.reduce((n, l) => n + l.line_total, 0);
    const { rows: [o] } = await adminDb.query(
      `INSERT INTO orders (total, status, tenant_id, session_id, check_id, display_code) VALUES ($1, $2, $3, $4, $5, 'T') RETURNING id`,
      [total ?? sum, status, tenant.id, tenant.sessionId, checkId]);
    await insertOrderItemRows(adminDb, tenant.id, toOrderItemRows(lines).rows.map(r => ({ ...r, order_id: o.id })));
    return o.id;
  };
  const line = (name, quantity, price) => ({ id: 1, name, quantity, price, line_total: quantity * price, note: '' });

  before(async () => {
    server = await startServer();
    [t1, t2] = [await createTenant(), await createTenant()];
    [admin1, admin2, master] = [t1, t2, t1].map(t => apiClient(server.port, t.host));
    await admin1.login(t1.username);
    await admin2.login(t2.username);
    await enableTables(t1);
    await enableTables(t2);
    cashier = await addUser(t1, 'cassa');
    kitchen = await addUser(t1, 'cucina');
    room = (await admin1.post('/rooms', { name: 'Sala' })).body;
    tables = (await admin1.post(`/rooms/${room.id}/tables/bulk`, { prefix: 'T', from: 1, to: 8, seats: 4 })).body.created;
    const room2 = (await admin2.post('/rooms', { name: 'Sala' })).body;
    other = (await admin2.post(`/rooms/${room2.id}/tables`, { name: 'T1' })).body;
  });
  after(async () => {
    await deleteTenants(t1, t2);
    await server.close();
    await closePools();
  });

  it('modulo spento o senza accesso: MODULE_DISABLED / 401 / cucina esclusa', async () => {
    const t3 = await createTenant();
    const api3 = apiClient(server.port, t3.host);
    await api3.login(t3.username);
    assert.equal((await api3.get('/checks')).body.code, 'MODULE_DISABLED');
    await deleteTenants(t3);
    assert.equal((await apiClient(server.port, t1.host).get('/checks')).status, 401);
    assert.equal((await kitchen.get('/checks')).status, 403);
    assert.equal((await cashier.get('/checks')).status, 200);
  });

  it('apre il conto di un tavolo: numero, coperti, chi lo ha aperto, totale a zero', async () => {
    const res = await cashier.post('/checks', { table_id: tables[0].id, covers: 3 });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.number, 1);
    assert.equal(res.body.status, 'open');
    assert.equal(res.body.covers, 3);
    assert.equal(res.body.table_name, 'T1');
    assert.equal(res.body.room_name, 'Sala');
    assert.equal(res.body.opened_by_name, `cassa-${t1.slug}`);
    assert.equal(res.body.session_id, t1.sessionId);
    assert.deepEqual([res.body.orders_count, res.body.total, res.body.paid, res.body.due], [0, 0, 0, 0]);
    assert.equal(res.body.bill_requested_at, null);
  });

  it('un tavolo ha un solo conto aperto: TABLE_BUSY, anche con aperture contemporanee', async () => {
    const again = await cashier.post('/checks', { table_id: tables[0].id });
    assert.equal(again.status, 409);
    assert.equal(again.body.code, 'TABLE_BUSY');

    const results = await Promise.all(Array.from({ length: 5 }, () => admin1.post('/checks', { table_id: tables[1].id, covers: 2 })));
    assert.equal(results.filter(r => r.status === 201).length, 1);
    assert.equal(results.filter(r => r.status === 409 && r.body.code === 'TABLE_BUSY').length, 4);
  });

  it('numeri in fila anche con aperture contemporanee su tavoli diversi, senza buchi né doppioni', async () => {
    const results = await Promise.all(tables.slice(2, 7).map(tbl => admin1.post('/checks', { table_id: tbl.id, covers: 2 })));
    assert.ok(results.every(r => r.status === 201), JSON.stringify(results.map(r => r.body)));
    const { rows } = await adminDb.query('SELECT number FROM checks WHERE session_id = $1 ORDER BY number', [t1.sessionId]);
    assert.deepEqual(rows.map(r => r.number), [1, 2, 3, 4, 5, 6, 7]);
  });

  it('regole di apertura: tavolo inesistente, di un altro tenant, disattivo; coperti validi; serve la sessione', async () => {
    assert.equal((await admin1.post('/checks', { table_id: 999999999 })).status, 404);
    assert.equal((await admin1.post('/checks', { table_id: other.id })).status, 404, 'tavolo di un altro tenant');
    assert.equal((await admin1.post('/checks', { table_id: tables[7].id, covers: -1 })).status, 400);
    assert.equal((await admin1.post('/checks', { table_id: tables[7].id, covers: 100 })).status, 400);
    assert.equal((await admin1.post('/checks', {})).status, 400);

    await admin1.put(`/tables/${tables[7].id}`, { active: false });
    const inactive = await admin1.post('/checks', { table_id: tables[7].id });
    assert.equal(inactive.status, 409);
    assert.equal(inactive.body.code, 'TABLE_INACTIVE');
    await admin1.put(`/tables/${tables[7].id}`, { active: true });

    await adminDb.query('UPDATE sessions SET end_time = now() WHERE id = $1', [t1.sessionId]);
    const closed = await admin1.post('/checks', { table_id: tables[7].id });
    assert.equal(closed.status, 409);
    assert.equal(closed.body.code, 'NO_ACTIVE_SESSION');
    await adminDb.query('UPDATE sessions SET end_time = NULL WHERE id = $1', [t1.sessionId]);
  });

  it('elenco: solo i conti con lo stato richiesto, filtrabili per tavolo', async () => {
    const open = (await cashier.get('/checks')).body;
    assert.equal(open.length, 7);
    assert.ok(open.every(c => c.status === 'open'));
    const byTable = (await cashier.get(`/checks?table_id=${tables[0].id}`)).body;
    assert.equal(byTable.length, 1);
    assert.equal(byTable[0].table_name, 'T1');
    assert.deepEqual((await cashier.get('/checks?status=paid')).body, []);
    assert.equal((await cashier.get('/checks?status=boh')).status, 400);
  });

  it('dettaglio e totali: il server somma le comande non annullate, mai il client', async () => {
    const id = (await cashier.get(`/checks?table_id=${tables[0].id}`)).body[0].id;
    await addOrder(id, t1, [line('Spaghetti', 2, 9), line('Acqua', 1, 2)], { status: 'completed' });   // 20
    await addOrder(id, t1, [line('Tiramisù', 3, 5)], { status: 'pending' });                          // 15
    await addOrder(id, t1, [line('Errore', 1, 100)], { status: 'canceled' });                         // annullata: non conta

    const detail = (await cashier.get(`/checks/${id}`)).body;
    assert.equal(detail.orders.length, 3, 'tutte le comande, anche l\'annullata');
    assert.equal(detail.orders_count, 2, 'ma ne contano due');
    assert.equal(detail.total, 35);
    assert.equal(detail.due, 35);
    assert.deepEqual(detail.orders[0].items.map(i => [i.name, i.quantity, i.line_total]), [['Spaghetti', 2, 18], ['Acqua', 1, 2]]);
    assert.equal(typeof detail.orders[0].total, 'number');
    assert.equal((await cashier.get('/checks/999999999')).status, 404);
    assert.equal((await cashier.get('/checks/abc')).status, 400);
  });

  it('richiesta del conto: si imposta, è idempotente e si può annullare', async () => {
    const id = (await cashier.get(`/checks?table_id=${tables[0].id}`)).body[0].id;
    const first = await cashier.post(`/checks/${id}/bill-request`, {});
    assert.equal(first.status, 200);
    assert.ok(first.body.bill_requested_at);
    await sleep(15);
    const second = await cashier.post(`/checks/${id}/bill-request`, {});
    assert.equal(second.body.bill_requested_at, first.body.bill_requested_at, 'non si sposta');
    assert.equal((await cashier.post(`/checks/${id}/bill-request`, { requested: false })).body.bill_requested_at, null);
    assert.equal((await cashier.post('/checks/999999999/bill-request', {})).status, 404);
  });

  it('annullare un conto: solo admin e responsabile, solo senza comande attive', async () => {
    const withOrders = (await cashier.get(`/checks?table_id=${tables[0].id}`)).body[0].id;
    assert.equal((await cashier.post(`/checks/${withOrders}/void`, {})).status, 403);
    const blocked = await admin1.post(`/checks/${withOrders}/void`, {});
    assert.equal(blocked.status, 409);
    assert.equal(blocked.body.code, 'CHECK_HAS_ORDERS');

    const empty = (await cashier.get(`/checks?table_id=${tables[2].id}`)).body[0].id;
    const voided = await admin1.post(`/checks/${empty}/void`, {});
    assert.equal(voided.status, 200);
    assert.equal(voided.body.status, 'void');
    assert.ok(voided.body.closed_at);
    assert.equal((await admin1.post(`/checks/${empty}/void`, {})).body.code, 'CHECK_CLOSED');
    assert.equal((await cashier.post(`/checks/${empty}/bill-request`, {})).body.code, 'CHECK_CLOSED');
    // il tavolo è di nuovo libero
    assert.equal((await cashier.post('/checks', { table_id: tables[2].id, covers: 2 })).status, 201);
  });

  it('isolamento: un altro tenant non vede né tocca i conti', async () => {
    const id = (await cashier.get(`/checks?table_id=${tables[0].id}`)).body[0].id;
    assert.deepEqual((await admin2.get('/checks')).body, []);
    assert.equal((await admin2.get(`/checks/${id}`)).status, 404);
    assert.equal((await admin2.post(`/checks/${id}/bill-request`, {})).status, 404);
    assert.equal((await admin2.post(`/checks/${id}/void`, {})).status, 404);
    assert.equal((await admin2.post('/checks', { table_id: other.id, covers: 1 })).status, 201, 'il suo tavolo sì');
  });

  it('eventi in tempo reale: il personale riceve check_updated, il KDS pubblico no', async () => {
    const staff = await connectWs(server.port, t1.host, { cookie: cashier.cookie });
    const kds = await connectWs(server.port, t1.host, { publicKds: true });
    const id = (await cashier.get(`/checks?table_id=${tables[3].id}`)).body[0].id;
    await cashier.post(`/checks/${id}/bill-request`, {});
    await sleep(100);
    assert.ok(staff.types().includes('check_updated'));
    const event = staff.messages.find(m => m.type === 'check_updated');
    assert.equal(event.check.id, id);
    assert.ok(event.check.bill_requested_at);
    assert.deepEqual(kds.types(), [], 'nessun dato del conto al KDS pubblico');
    staff.ws.close(); kds.ws.close();
  });

  it('eliminare un tenant cancella anche i suoi conti; un utente eliminato lascia il conto', async () => {
    const tmpUser = await addUser(t1, 'responsabile');
    const { rows: [u] } = await adminDb.query(`SELECT id FROM users WHERE tenant_id = $1 AND role = 'responsabile'`, [t1.id]);
    const made = await tmpUser.post('/checks', { table_id: tables[7].id, covers: 1 });
    assert.equal(made.status, 201);
    assert.equal((await admin1.request('DELETE', `/auth/admin/users/${u.id}`)).status, 200);
    const { rows: [row] } = await adminDb.query('SELECT opened_by FROM checks WHERE id = $1', [made.body.id]);
    assert.equal(row.opened_by, null, 'il conto resta, senza chi lo aprì');

    const doomed = await createTenant();
    const api = apiClient(server.port, doomed.host);
    await api.login(doomed.username);
    await enableTables(doomed);
    const r = (await api.post('/rooms', { name: 'S' })).body;
    const tb = (await api.post(`/rooms/${r.id}/tables`, { name: 'T1' })).body;
    const chk = (await api.post('/checks', { table_id: tb.id, covers: 2 })).body;
    await addOrder(chk.id, doomed, [line('Pizza', 1, 8)]);
    const res = await master.request('DELETE', `/master/tenants/${doomed.id}`, { confirmSlug: doomed.slug }, masterCookie);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    for (const table of ['checks', 'orders', 'order_items', 'dining_tables', 'rooms'])
      assert.equal((await adminDb.query(`SELECT 1 FROM ${table} WHERE tenant_id = $1`, [doomed.id])).rows.length, 0, table);
  });
});
