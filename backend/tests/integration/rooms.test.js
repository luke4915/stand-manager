// Sale e tavoli: modulo `tables`, ruoli, vincoli sui nomi, tavoli in serie, isolamento tra tenant.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { startServer, createTenant, deleteTenants, closePools, apiClient, adminDb, PASSWORD } from './helpers.js';

process.env.MASTER_JWT_SECRET ||= 'segreto-master-di-prova-lungo-almeno-32-caratteri';
const masterCookie = { cookie: `master_token=${jwt.sign({ master: true }, process.env.MASTER_JWT_SECRET)}` };

describe('sale e tavoli', () => {
  let server, t1, t2, admin1, admin2, cashier, kitchen, master;

  const enableTables = (t) => master.request('PUT', `/master/tenants/${t.id}/modules`, { businessType: 'ristorante', modules: ['kds', 'stats', 'tables'] }, masterCookie);
  const addUser = async (t, role) => {
    const username = `${role}-${t.slug}`;
    await adminDb.query(`INSERT INTO users (username, password_hash, role, tenant_id) VALUES ($1, $2, $3, $4)`, [username, await bcrypt.hash(PASSWORD, 4), role, t.id]);
    const api = apiClient(server.port, t.host);
    await api.login(username);
    return api;
  };

  before(async () => {
    server = await startServer();
    [t1, t2] = [await createTenant(), await createTenant()];
    [admin1, admin2, master] = [t1, t2, t1].map(t => apiClient(server.port, t.host));
    await admin1.login(t1.username);
    await admin2.login(t2.username);
    cashier = await addUser(t1, 'cassa');
    kitchen = await addUser(t1, 'cucina');
  });
  after(async () => {
    await deleteTenants(t1, t2);
    await server.close();
    await closePools();
  });

  it('modulo spento (sagre): le route rispondono MODULE_DISABLED', async () => {
    const res = await admin1.get('/rooms');
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'MODULE_DISABLED');
    assert.equal((await admin1.post('/rooms', { name: 'Sala' })).status, 403);
    assert.equal((await enableTables(t1)).status, 200);
    assert.equal((await admin1.get('/rooms')).status, 200);
    assert.equal((await admin2.get('/rooms')).status, 403, 'l\'altro tenant non ha il modulo');
  });

  it('i ruoli: la cassa legge, solo l\'admin modifica, la cucina non entra', async () => {
    assert.equal((await cashier.get('/rooms')).status, 200);
    assert.equal((await cashier.post('/rooms', { name: 'Sala' })).status, 403);
    assert.equal((await kitchen.get('/rooms')).status, 403);
    assert.equal((await apiClient(server.port, t1.host).get('/rooms')).status, 401);
  });

  it('sale: crea, nome unico senza distinguere le maiuscole, rinomina, disattiva', async () => {
    const created = await admin1.post('/rooms', { name: '  Sala interna ' });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.deepEqual(created.body, { id: created.body.id, name: 'Sala interna', active: true, tables: [] });
    assert.equal((await admin1.post('/rooms', { name: 'SALA INTERNA' })).status, 409);
    assert.equal((await admin1.post('/rooms', { name: '   ' })).status, 400);

    const id = created.body.id;
    assert.equal((await admin1.put(`/rooms/${id}`, { name: 'Veranda' })).body.name, 'Veranda');
    assert.equal((await admin1.put(`/rooms/${id}`, { active: false })).body.active, false);
    assert.equal((await admin1.put(`/rooms/${id}`, {})).status, 400);
    assert.equal((await admin1.put('/rooms/999999999', { name: 'x' })).status, 404);
    await admin1.put(`/rooms/${id}`, { active: true });
  });

  it('tavoli: nome unico nella sala (ma uguale in un\'altra), posti da 1 a 99', async () => {
    const [a, b] = [(await admin1.post('/rooms', { name: 'Sala A' })).body, (await admin1.post('/rooms', { name: 'Sala B' })).body];
    const t = await admin1.post(`/rooms/${a.id}/tables`, { name: 'T1', seats: 4 });
    assert.equal(t.status, 201, JSON.stringify(t.body));
    assert.deepEqual(t.body, { id: t.body.id, room_id: a.id, name: 'T1', seats: 4, active: true });
    assert.equal((await admin1.post(`/rooms/${a.id}/tables`, { name: 't1' })).status, 409);
    assert.equal((await admin1.post(`/rooms/${b.id}/tables`, { name: 'T1' })).status, 201, 'stesso nome in un\'altra sala');
    assert.equal((await admin1.post(`/rooms/${a.id}/tables`, { name: 'T2' })).body.seats, 2, 'posti predefiniti');
    assert.equal((await admin1.post(`/rooms/${a.id}/tables`, { name: 'T3', seats: 0 })).status, 400);
    assert.equal((await admin1.post(`/rooms/${a.id}/tables`, { name: 'T3', seats: 100 })).status, 400);
    assert.equal((await admin1.post('/rooms/999999999/tables', { name: 'T1' })).status, 404);

    assert.equal((await admin1.put(`/tables/${t.body.id}`, { seats: 6 })).body.seats, 6);
    assert.equal((await admin1.put(`/tables/${t.body.id}`, { name: 'T2' })).status, 409);
    assert.equal((await admin1.put(`/tables/${t.body.id}`, { active: false })).body.active, false);
    assert.equal((await admin1.put(`/tables/${t.body.id}`, {})).status, 400);
    assert.equal((await admin1.put('/tables/999999999', { seats: 2 })).status, 404);
    assert.equal((await cashier.put(`/tables/${t.body.id}`, { seats: 2 })).status, 403);
  });

  it('tavoli in serie: prefisso e numeri, i nomi già presenti si saltano, limite di 100', async () => {
    const room = (await admin1.post('/rooms', { name: 'Giardino' })).body;
    const bulk = await admin1.post(`/rooms/${room.id}/tables/bulk`, { prefix: 'G', from: 1, to: 5, seats: 4 });
    assert.equal(bulk.status, 201, JSON.stringify(bulk.body));
    assert.deepEqual(bulk.body.created.map(x => x.name).sort(), ['G1', 'G2', 'G3', 'G4', 'G5']);
    assert.ok(bulk.body.created.every(x => x.seats === 4));
    assert.equal(bulk.body.skipped, 0);

    const again = await admin1.post(`/rooms/${room.id}/tables/bulk`, { prefix: 'G', from: 3, to: 8 });
    assert.equal(again.body.created.length, 3, 'solo G6, G7, G8');
    assert.equal(again.body.skipped, 3);

    assert.equal((await admin1.post(`/rooms/${room.id}/tables/bulk`, { prefix: 'X', from: 1, to: 101 })).status, 400);
    assert.equal((await admin1.post(`/rooms/${room.id}/tables/bulk`, { prefix: 'X', from: 5, to: 2 })).status, 400);
    assert.equal((await admin1.post('/rooms/999999999/tables/bulk', { prefix: 'X', from: 1, to: 2 })).status, 404);
    const noPrefix = await admin1.post(`/rooms/${room.id}/tables/bulk`, { from: 10, to: 11 });
    assert.deepEqual(noPrefix.body.created.map(x => x.name).sort(), ['10', '11']);
  });

  it('l\'elenco restituisce sale con i loro tavoli', async () => {
    const list = (await cashier.get('/rooms')).body;
    const giardino = list.find(r => r.name === 'Giardino');
    assert.equal(giardino.tables.length, 10);
    assert.ok(giardino.tables.every(x => x.room_id === giardino.id));
  });

  it('eliminare: una sala con tavoli no (409), vuota sì; un tavolo sì', async () => {
    const list = (await admin1.get('/rooms')).body;
    const giardino = list.find(r => r.name === 'Giardino');
    const refused = await admin1.request('DELETE', `/rooms/${giardino.id}`);
    assert.equal(refused.status, 409);
    assert.equal(refused.body.code, 'ROOM_NOT_EMPTY');
    for (const table of giardino.tables) assert.equal((await admin1.request('DELETE', `/tables/${table.id}`)).status, 200);
    assert.equal((await admin1.request('DELETE', `/tables/${giardino.tables[0].id}`)).status, 404);
    assert.equal((await admin1.request('DELETE', `/rooms/${giardino.id}`)).status, 200);
    assert.equal((await cashier.request('DELETE', `/rooms/${list[0].id}`)).status, 403);
  });

  it('isolamento: un altro tenant non vede né tocca le sale e i tavoli', async () => {
    await enableTables(t2);
    const [room] = (await admin1.get('/rooms')).body;
    const table = (await admin1.post(`/rooms/${room.id}/tables`, { name: 'Riservato' })).body;

    assert.deepEqual((await admin2.get('/rooms')).body, []);
    assert.equal((await admin2.put(`/rooms/${room.id}`, { name: 'Rubata' })).status, 404);
    assert.equal((await admin2.request('DELETE', `/rooms/${room.id}`)).status, 404);
    assert.equal((await admin2.post(`/rooms/${room.id}/tables`, { name: 'Intruso' })).status, 404);
    assert.equal((await admin2.put(`/tables/${table.id}`, { seats: 9 })).status, 404);
    assert.equal((await admin2.request('DELETE', `/tables/${table.id}`)).status, 404);
    // lo stesso nome in un altro tenant è un'altra sala
    assert.equal((await admin2.post('/rooms', { name: room.name })).status, 201);
  });

  it('le modifiche dell\'admin finiscono nell\'audit', async () => {
    const { rows } = await adminDb.query(`SELECT DISTINCT action FROM audit_logs WHERE tenant_id = $1 AND action ~ 'ROOM|TABLE'`, [t1.id]);
    const actions = rows.map(r => r.action).sort();
    for (const a of ['CREATE_ROOM', 'UPDATE_ROOM', 'DELETE_ROOM', 'CREATE_TABLE', 'UPDATE_TABLE', 'DELETE_TABLE', 'CREATE_TABLES_BULK'])
      assert.ok(actions.includes(a), a);
  });

  it('eliminare un tenant cancella anche sale e tavoli', async () => {
    const doomed = await createTenant();
    const api = apiClient(server.port, doomed.host);
    await api.login(doomed.username);
    await enableTables(doomed);
    const room = (await api.post('/rooms', { name: 'Sala' })).body;
    await api.post(`/rooms/${room.id}/tables/bulk`, { prefix: 'T', from: 1, to: 3 });
    const res = await master.request('DELETE', `/master/tenants/${doomed.id}`, { confirmSlug: doomed.slug }, masterCookie);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    for (const table of ['rooms', 'dining_tables'])
      assert.equal((await adminDb.query(`SELECT 1 FROM ${table} WHERE tenant_id = $1`, [doomed.id])).rows.length, 0, table);
  });
});
