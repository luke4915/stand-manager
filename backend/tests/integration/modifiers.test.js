// Modificatori dei piatti (migrazione 043): gruppi con opzioni, collegati ai prodotti; il prezzo lo calcola il server.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import { startServer, createTenant, deleteTenants, closePools, apiClient, adminDb, PASSWORD } from './helpers.js';

describe('modificatori', () => {
  let server, t, sagra, admin, waiter, sagraApi, tables, cottura, aggiunte, steak;

  const group = (name, extra = {}) => ({ name, min_select: 0, max_select: null, options: [{ name: 'Uno', price_delta: 0 }, { name: 'Due', price_delta: 1.5 }], ...extra });
  const open = async (table) => (await admin.post('/checks', { table_id: table.id, covers: 2 })).body.id;
  const order = (check, items, api = admin) => api.post(`/checks/${check}/courses`, { groups: [{ course_id: null, seq: 1, items }] });
  const item = (modifiers, extra = {}) => ({ id: steak, name: 'x', quantity: 1, modifiers, ...extra });

  before(async () => {
    server = await startServer();
    [t, sagra] = [await createTenant({ businessType: 'ristorante' }), await createTenant()];
    admin = apiClient(server.port, t.host);
    await admin.login(t.username);
    sagraApi = apiClient(server.port, sagra.host);
    await sagraApi.login(sagra.username);
    await adminDb.query(`INSERT INTO users (username, password_hash, role, tenant_id) VALUES ($1, $2, 'cameriere', $3)`, [`w-${t.slug}`, await bcrypt.hash(PASSWORD, 4), t.id]);
    waiter = apiClient(server.port, t.host);
    await waiter.login(`w-${t.slug}`);
    ({ rows: [{ id: steak }] } = await adminDb.query(`INSERT INTO products (name, price, category, tenant_id) VALUES ('Tagliata', 18, 'Secondi', $1) RETURNING id`, [t.id]));
    const room = (await admin.post('/rooms', { name: 'Sala' })).body;
    tables = (await admin.post(`/rooms/${room.id}/tables/bulk`, { prefix: 'T', from: 1, to: 8 })).body.created;
    cottura = (await admin.post('/modifier-groups', group('Cottura', { min_select: 1, max_select: 1, options: [{ name: 'Al sangue', price_delta: 0 }, { name: 'Media', price_delta: 0 }, { name: 'Ben cotta', price_delta: 0 }] }))).body;
    aggiunte = (await admin.post('/modifier-groups', group('Aggiunte', { max_select: 2, options: [{ name: 'Parmigiano', price_delta: 1.5 }, { name: 'Rucola', price_delta: 1 }, { name: 'Bufala', price_delta: 2.3 }] }))).body;
    const linked = await admin.put(`/products/${steak}/modifier-groups`, { group_ids: [cottura.id, aggiunte.id] });
    assert.equal(linked.status, 200, JSON.stringify(linked.body));
  });
  after(async () => {
    await deleteTenants(t, sagra);
    await server.close();
    await closePools();
  });

  const opt = (g, name) => g.options.find(o => o.name === name).id;

  it('i gruppi si creano con le opzioni, si leggono con i prodotti collegati, solo l\'admin li modifica', async () => {
    assert.deepEqual(cottura.options.map(o => o.name), ['Al sangue', 'Media', 'Ben cotta']);
    const list = (await waiter.get('/modifier-groups')).body;
    assert.deepEqual(list.map(g => [g.name, g.min_select, g.max_select, g.product_ids]), [['Cottura', 1, 1, [steak]], ['Aggiunte', 0, 2, [steak]]]);
    assert.equal(list[1].options[2].price_delta, 2.3);
    assert.equal((await waiter.post('/modifier-groups', group('Altro'))).status, 403);
    assert.equal((await waiter.put(`/products/${steak}/modifier-groups`, { group_ids: [] })).status, 403);
    assert.equal((await admin.post('/modifier-groups', group('cottura'))).status, 409, 'nome unico senza distinguere le maiuscole');
    assert.equal((await sagraApi.get('/modifier-groups')).status, 403, 'una sagra non li ha');
  });

  it('regole del gruppo: opzioni, minimo e massimo coerenti', async () => {
    assert.equal((await admin.post('/modifier-groups', group('Vuoto', { options: [] }))).status, 400);
    assert.equal((await admin.post('/modifier-groups', group('Max', { min_select: 3, max_select: 2 }))).status, 400);
    assert.equal((await admin.post('/modifier-groups', group('Min', { min_select: 5 }))).status, 400, 'più del numero di opzioni');
    assert.equal((await admin.post('/modifier-groups', group('Doppie', { options: [{ name: 'a', price_delta: 0 }, { name: 'A', price_delta: 1 }] }))).status, 400);
    assert.equal((await admin.post('/modifier-groups', group('Prezzo', { options: [{ name: 'a', price_delta: 1.234 }] }))).status, 400);
  });

  it('la comanda con opzioni: prezzo di listino = piatto + supplementi, calcolato dal server', async () => {
    const check = await open(tables[0]);
    const res = await order(check, [item([opt(cottura, 'Al sangue'), opt(aggiunte, 'Parmigiano'), opt(aggiunte, 'Rucola')], { quantity: 2 })]);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const line = res.body.orders[0].items[0];
    assert.deepEqual(line.modifiers.map(m => [m.name, m.price]), [['Al sangue', 0], ['Parmigiano', 1.5], ['Rucola', 1]]);
    assert.equal(line.original_price, 20.5, '18 + 1,50 + 1');
    assert.equal(line.line_total, 41, '2 × 20,50');
    assert.equal((await admin.get(`/checks/${check}`)).body.total, 41);
  });

  it('il cliente non decide: prezzi e nomi nel body si ignorano, le opzioni sono solo id', async () => {
    const check = await open(tables[1]);
    const res = await order(check, [{ ...item([opt(cottura, 'Media')]), price: 0.01, modifiers: [opt(cottura, 'Media')] }]);
    assert.equal(res.body.orders[0].items[0].line_total, 18);
    assert.equal((await order(check, [{ ...item([opt(cottura, 'Media')]), modifiers: [{ id: opt(cottura, 'Media'), price: -99 }] }])).status, 400, 'forma non valida');
  });

  it('opzioni obbligatorie, troppe, inventate, ripetute o di un altro prodotto si rifiutano', async () => {
    const check = await open(tables[2]);
    const fails = async (modifiers, code) => {
      const r = await order(check, [item(modifiers)]);
      assert.equal(r.status, 400, JSON.stringify(r.body));
      assert.equal(r.body.code, code);
    };
    await fails([], 'MODIFIER_REQUIRED');
    await fails([opt(aggiunte, 'Rucola')], 'MODIFIER_REQUIRED');
    await fails([opt(cottura, 'Media'), opt(cottura, 'Ben cotta')], 'MODIFIER_TOO_MANY');
    await fails([opt(cottura, 'Media'), opt(aggiunte, 'Parmigiano'), opt(aggiunte, 'Rucola'), opt(aggiunte, 'Bufala')], 'MODIFIER_TOO_MANY');
    await fails([opt(cottura, 'Media'), 999999999], 'INVALID_MODIFIER');
    await fails([opt(cottura, 'Media'), opt(cottura, 'Media')], 'INVALID_MODIFIER');
    // un prodotto senza gruppi non ammette opzioni
    const plain = await order(check, [{ id: t.productId, name: 'x', quantity: 1, modifiers: [opt(cottura, 'Media')] }]);
    assert.equal(plain.body.code, 'INVALID_MODIFIER');
    assert.equal((await adminDb.query(`SELECT COUNT(*)::int AS n FROM orders WHERE check_id = $1 AND order_type <> 'cover'`, [check])).rows[0].n, 0, 'nessuna comanda creata');
  });

  it('lo storico non cambia se il gruppo si modifica o si elimina', async () => {
    const check = await open(tables[3]);
    const res = await order(check, [item([opt(cottura, 'Media'), opt(aggiunte, 'Bufala')])]);
    const lineId = res.body.orders[0].items[0].line_id;
    await admin.put(`/modifier-groups/${aggiunte.id}`, group('Aggiunte', { max_select: 2, options: [{ name: 'Bufala', price_delta: 5 }] }));
    const detail = (await admin.get(`/checks/${check}`)).body;
    const line = detail.orders.flatMap(o => o.items).find(i => i.line_id === lineId);
    assert.deepEqual(line.modifiers.map(m => [m.name, m.price]), [['Media', 0], ['Bufala', 2.3]], 'prezzo di allora');
    assert.equal(detail.total, 20.3);
    // le opzioni sono state sostituite: l'id vecchio non vale più, quello nuovo sì
    assert.equal((await order(check, [item([opt(cottura, 'Media'), opt(aggiunte, 'Bufala')])])).status, 400, 'id vecchio');
    const fresh = (await admin.get('/modifier-groups')).body.find(g => g.id === aggiunte.id);
    assert.equal((await order(check, [item([opt(cottura, 'Media'), opt(fresh, 'Bufala')])])).status, 201, 'id nuovo');
    assert.equal((await admin.request('DELETE', `/modifier-groups/${aggiunte.id}`)).status, 200);
    assert.equal((await admin.get('/modifier-groups')).body.length, 1);
    assert.equal((await admin.get(`/checks/${check}`)).body.orders[0].items[0].modifiers.length, 2, 'la copia resta');
  });

  it('sconti e omaggi si applicano al prezzo con i supplementi; la ricevuta e la cucina vedono le opzioni', async () => {
    const check = await open(tables[4]);
    const res = await order(check, [item([opt(cottura, 'Al sangue')], { type: 'discount', discountMode: 'percent', discountValue: 50 })]);
    assert.equal(res.body.orders[0].items[0].line_total, 9);
    const denied = await order(check, [item([opt(cottura, 'Al sangue')], { type: 'gift' })], waiter);
    assert.equal(denied.status, 403, 'il cameriere non regala');
    const receipt = (await admin.get(`/checks/${check}/receipt`)).body;
    assert.equal(receipt.lines[0].name, 'Tagliata · Al sangue');
    const kitchen = (await admin.get('/orders?session=active')).body.find(o => o.check_id === check);
    assert.deepEqual(kitchen.items[0].modifiers.map(m => m.name), ['Al sangue']);
  });

  it('un gruppo di un altro locale non si collega; un altro locale non vede i gruppi', async () => {
    const { rows: [foreign] } = await adminDb.query(`INSERT INTO modifier_groups (name, tenant_id) VALUES ('Altrui', $1) RETURNING id`, [sagra.id]);
    const res = await admin.put(`/products/${steak}/modifier-groups`, { group_ids: [foreign.id] });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'INVALID_GROUP');
    assert.equal((await admin.put('/products/999999999/modifier-groups', { group_ids: [] })).status, 404);
    assert.equal((await admin.request('DELETE', `/modifier-groups/${foreign.id}`)).status, 404);
    await adminDb.query('DELETE FROM modifier_groups WHERE id = $1', [foreign.id]);
  });
});
