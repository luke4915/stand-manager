// Portate (passo 3-1/3-2): lista del locale, comande per portata con uscita scaglionata, «manda», riordino.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { startServer, createTenant, deleteTenants, closePools, apiClient, adminDb, connectWs, sleep, PASSWORD } from './helpers.js';

describe('portate', () => {
  let server, t, sagra, admin, cashier, kitchen, sagraApi, tables, starter, main, dessert;

  const line = (quantity = 1, id = t.productId) => ({ id, name: 'Panino', quantity });
  const openCheck = async (table, covers = 2) => (await admin.post('/checks', { table_id: table.id, covers })).body.id;
  const send = (checkId, groups, extra = {}) => admin.post(`/checks/${checkId}/courses`, { groups, ...extra });
  const statusOf = async (id) => (await adminDb.query('SELECT status, course_seq, course_name, fired_at FROM orders WHERE id = $1', [id])).rows[0];
  const user = async (role) => {
    const username = `${role}-${t.slug}`;
    await adminDb.query(`INSERT INTO users (username, password_hash, role, tenant_id) VALUES ($1, $2, $3, $4)`, [username, await bcrypt.hash(PASSWORD, 4), role, t.id]);
    const api = apiClient(server.port, t.host);
    await api.login(username);
    return api;
  };

  before(async () => {
    server = await startServer();
    [t, sagra] = [await createTenant({ businessType: 'ristorante' }), await createTenant()];
    admin = apiClient(server.port, t.host);
    await admin.login(t.username);
    sagraApi = apiClient(server.port, sagra.host);
    await sagraApi.login(sagra.username);
    cashier = await user('cassa');
    kitchen = await user('cucina');
    const room = (await admin.post('/rooms', { name: 'Sala' })).body;
    tables = (await admin.post(`/rooms/${room.id}/tables/bulk`, { prefix: 'T', from: 1, to: 12 })).body.created;
    [starter, main, dessert] = [];
    for (const name of ['Antipasti', 'Primi', 'Dolci']) {
      const course = (await admin.post('/courses', { name })).body;
      if (name === 'Antipasti') starter = course; else if (name === 'Primi') main = course; else dessert = course;
    }
  });
  after(async () => {
    await deleteTenants(t, sagra);
    await server.close();
    await closePools();
  });

  it('lista delle portate: ordine, nome unico, riordino, solo admin, solo con il modulo tavoli', async () => {
    assert.deepEqual((await admin.get('/courses')).body.map(c => c.name), ['Antipasti', 'Primi', 'Dolci']);
    assert.equal((await admin.post('/courses', { name: 'antipasti' })).status, 409, 'nome unico senza distinguere le maiuscole');
    assert.equal((await admin.post('/courses', { name: '  ' })).status, 400);
    assert.equal((await cashier.post('/courses', { name: 'Secondi' })).status, 403);
    assert.equal((await cashier.get('/courses')).status, 200, 'la cassa le legge');
    assert.equal((await kitchen.get('/courses')).status, 403);

    const second = (await admin.post('/courses', { name: 'Secondi' })).body;
    const reordered = await admin.put('/courses/order', { ids: [starter.id, main.id, second.id, dessert.id] });
    assert.equal(reordered.status, 200, JSON.stringify(reordered.body));
    assert.deepEqual((await admin.get('/courses')).body.map(c => c.name), ['Antipasti', 'Primi', 'Secondi', 'Dolci']);
    assert.equal((await admin.put('/courses/order', { ids: [starter.id] })).status, 400, 'mancano delle portate');
    assert.equal((await admin.put(`/courses/${second.id}`, { name: 'Secondi piatti' })).body.name, 'Secondi piatti');
    assert.equal((await admin.request('DELETE', `/courses/${second.id}`)).status, 200);
    assert.equal((await sagraApi.get('/courses')).status, 403, 'una sagra non ha le portate');
  });

  it('un prodotto ha una portata del suo locale', async () => {
    const product = (await admin.get('/products')).body.find(p => p.id === t.productId);
    const save = (course_id) => admin.put(`/products/${t.productId}`, { name: product.name, price: Number(product.price), category: product.category, ...(course_id !== undefined && { course_id }) });
    assert.equal((await save(main.id)).body.course_id, main.id);
    assert.equal((await save()).body.course_id, main.id, 'senza course_id non cambia');
    assert.equal((await save(null)).body.course_id, null);
    const { rows: [foreign] } = await adminDb.query(`INSERT INTO courses (name, tenant_id) VALUES ('Altrui', $1) RETURNING id`, [sagra.id]);
    assert.equal((await save(foreign.id)).status, 400, 'la portata di un altro locale non si usa');
    assert.equal((await save(999999999)).status, 400);
    await adminDb.query('DELETE FROM courses WHERE id = $1', [foreign.id]);
  });

  it('il giro: la prima portata esce, le altre restano da mandare, con ordine di uscita e portata', async () => {
    const check = await openCheck(tables[0]);
    const res = await send(check, [
      { course_id: starter.id, seq: 1, items: [line(1)] },
      { course_id: dessert.id, seq: 3, items: [line(2)] },
      { course_id: main.id, seq: 2, items: [line(3)] },
    ]);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.orders.length, 3);
    assert.equal(res.body.fired.length, 1);
    const bySeq = res.body.orders; // ordinate per uscita
    assert.deepEqual(bySeq.map(o => [o.course_name, o.status, o.course_seq]), [['Antipasti', 'pending', 1], ['Primi', 'scheduled', 2], ['Dolci', 'scheduled', 3]]);
    assert.ok((await statusOf(bySeq[0].id)).fired_at);
    assert.equal((await statusOf(bySeq[1].id)).fired_at, null);
    assert.equal(res.body.check.total, 30, 'tutte le portate contano nel conto: 6 panini da 5 €');
    assert.equal(new Set(bySeq.map(o => o.display_code)).size, 3, 'ogni comanda ha il suo codice');

    // la cucina vede solo quella mandata
    const kitchenView = (await kitchen.get('/orders?session=active&status=pending,preparing')).body.filter(o => o.check_id === check);
    assert.deepEqual(kitchenView.map(o => o.id), [bySeq[0].id]);
    // le portate in arrivo si possono leggere (il monitor della cucina le mostra attenuate)
    const upcoming = (await kitchen.get('/orders?session=active&status=scheduled')).body.filter(o => o.check_id === check);
    assert.deepEqual(upcoming.map(o => o.course_name).sort(), ['Dolci', 'Primi']);
    // il dettaglio del conto dice cosa è da mandare
    const detail = (await admin.get(`/checks/${check}`)).body;
    assert.deepEqual(detail.orders.map(o => [o.status, o.course_name]), [['pending', 'Antipasti'], ['scheduled', 'Primi'], ['scheduled', 'Dolci']]);
  });

  it('manda la prossima portata, o una precisa; poi non ce ne sono più', async () => {
    const check = await openCheck(tables[1]);
    const created = (await send(check, [
      { course_id: starter.id, seq: 1, items: [line()] }, { course_id: main.id, seq: 2, items: [line()] }, { course_id: dessert.id, seq: 3, items: [line()] },
    ])).body.orders;

    const next = await admin.post(`/checks/${check}/fire`, {});
    assert.equal(next.status, 200, JSON.stringify(next.body));
    assert.deepEqual(next.body.fired, [created[1].id], 'la prossima è la seconda');
    assert.equal((await statusOf(created[1].id)).status, 'pending');
    assert.ok((await statusOf(created[1].id)).fired_at);

    assert.equal((await admin.post(`/checks/${check}/fire`, { seq: 99 })).status, 404);
    const chosen = await admin.post(`/checks/${check}/fire`, { seq: created[2].course_seq });
    assert.deepEqual(chosen.body.fired, [created[2].id]);
    const none = await admin.post(`/checks/${check}/fire`, {});
    assert.equal(none.status, 409);
    assert.equal(none.body.code, 'NO_SCHEDULED_COURSES');
    assert.equal((await cashier.post(`/checks/${check}/fire`, {})).status, 409, 'la cassa può mandare');
    assert.equal((await kitchen.post(`/checks/${check}/fire`, {})).status, 403, 'la cucina no');
  });

  it('portate con lo stesso numero escono insieme; tutto «da mandare» con fire_first falso', async () => {
    const check = await openCheck(tables[2]);
    const res = await send(check, [
      { course_id: starter.id, seq: 1, items: [line()] }, { course_id: main.id, seq: 1, items: [line()] }, { course_id: dessert.id, seq: 2, items: [line()] },
    ], { fire_first: false });
    assert.deepEqual(res.body.fired, [], 'niente esce subito');
    assert.ok(res.body.orders.every(o => o.status === 'scheduled'));
    const fired = await admin.post(`/checks/${check}/fire`, {});
    assert.equal(fired.body.fired.length, 2, 'le due portate col numero 1 escono insieme');
    assert.deepEqual(fired.body.orders.map(o => o.course_name).sort(), ['Antipasti', 'Primi']);
  });

  it('reinviare lo stesso giro non lo duplica (anche due invii insieme)', async () => {
    const check = await openCheck(tables[8]);
    const groups = () => [
      { course_id: starter.id, seq: 1, client_order_id: keys[0], items: [line()] },
      { course_id: main.id, seq: 2, client_order_id: keys[1], items: [line()] },
    ];
    const keys = [randomUUID(), randomUUID()];
    const first = await send(check, groups());
    assert.equal(first.status, 201);
    const again = await send(check, groups());
    assert.equal(again.status, 200);
    assert.equal(again.body.duplicate, true);
    assert.deepEqual(again.body.orders.map(o => o.id).sort(), first.body.orders.map(o => o.id).sort());
    assert.deepEqual(again.body.fired, [], 'non si ristampa');
    assert.equal((await adminDb.query(`SELECT COUNT(*)::int AS n FROM orders WHERE check_id = $1 AND order_type <> 'cover'`, [check])).rows[0].n, 2);

    const keys2 = [randomUUID()];
    const check2 = await openCheck(tables[9]);
    const results = await Promise.all([1, 2, 3].map(() => send(check2, [{ course_id: starter.id, seq: 1, client_order_id: keys2[0], items: [line()] }])));
    assert.ok(results.every(r => [200, 201].includes(r.status)), JSON.stringify(results.map(r => r.body)));
    assert.equal(results.filter(r => r.status === 201).length, 1);
    assert.equal((await adminDb.query(`SELECT COUNT(*)::int AS n FROM orders WHERE check_id = $1 AND order_type <> 'cover'`, [check2])).rows[0].n, 1);
    assert.equal((await send(check2, [{ course_id: starter.id, seq: 1, client_order_id: keys2[0], items: [line()] }, { course_id: main.id, seq: 2, client_order_id: keys2[0], items: [line()] }])).status, 400, 'stessa chiave su due portate');
  });

  it('un secondo giro si accoda al primo', async () => {
    const check = await openCheck(tables[3]);
    await send(check, [{ course_id: starter.id, seq: 1, items: [line()] }, { course_id: main.id, seq: 2, items: [line()] }]);
    const second = await send(check, [{ course_id: dessert.id, seq: 1, items: [line()] }], { fire_first: false });
    assert.equal(second.body.orders[0].course_seq, 3, 'dopo l\'ultima portata già sul conto');
  });

  it('riordina le portate da mandare; quelle già mandate non si spostano', async () => {
    const check = await openCheck(tables[4]);
    const [a, b, c] = (await send(check, [
      { course_id: starter.id, seq: 1, items: [line()] }, { course_id: main.id, seq: 2, items: [line()] }, { course_id: dessert.id, seq: 3, items: [line()] },
    ])).body.orders;
    const moved = await admin.put(`/checks/${check}/sequence`, { orders: [{ id: c.id, seq: 2 }, { id: b.id, seq: 3 }] });
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
    assert.deepEqual(moved.body.orders.map(o => [o.course_name, o.course_seq]), [['Antipasti', 1], ['Primi', 3], ['Dolci', 2]]);
    assert.deepEqual((await admin.post(`/checks/${check}/fire`, {})).body.fired, [c.id], 'esce prima il dolce, ora secondo');
    const locked = await admin.put(`/checks/${check}/sequence`, { orders: [{ id: a.id, seq: 5 }] });
    assert.equal(locked.status, 409, 'l\'antipasto è già uscito');
    assert.equal(locked.body.code, 'ORDER_NOT_SCHEDULED');
    assert.equal((await admin.put(`/checks/${check}/sequence`, { orders: [{ id: b.id, seq: 1 }, { id: b.id, seq: 2 }] })).status, 400);
  });

  it('una portata da mandare non si completa a mano, ma si può stornare (lo stock torna)', async () => {
    await adminDb.query('UPDATE products SET stock_enabled = true, stock = 10 WHERE id = $1', [t.productId]);
    const check = await openCheck(tables[5]);
    const [a, b] = (await send(check, [{ course_id: starter.id, seq: 1, items: [line(2)] }, { course_id: main.id, seq: 2, items: [line(3)] }])).body.orders;
    assert.equal((await adminDb.query('SELECT stock FROM products WHERE id = $1', [t.productId])).rows[0].stock, 5, 'lo stock si scala per tutto il giro');

    const done = await kitchen.put(`/orders/${b.id}`, { status: 'completed' });
    assert.equal(done.status, 409);
    assert.equal(done.body.code, 'ORDER_SCHEDULED');

    assert.equal((await admin.put(`/orders/${b.id}`, { status: 'canceled' })).status, 200);
    assert.equal((await adminDb.query('SELECT stock FROM products WHERE id = $1', [t.productId])).rows[0].stock, 8);
    assert.equal((await admin.get(`/checks/${check}`)).body.total, 10, 'la portata stornata esce dal conto');
    assert.ok(a.id);
    await adminDb.query('UPDATE products SET stock_enabled = false, stock = NULL WHERE id = $1', [t.productId]);
  });

  it('stock insufficiente per il giro: non si crea niente', async () => {
    await adminDb.query('UPDATE products SET stock_enabled = true, stock = 4 WHERE id = $1', [t.productId]);
    const check = await openCheck(tables[6]);
    const res = await send(check, [{ course_id: starter.id, seq: 1, items: [line(2)] }, { course_id: main.id, seq: 2, items: [line(3)] }]);
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'OUT_OF_STOCK');
    assert.equal((await adminDb.query('SELECT COUNT(*)::int AS n FROM orders WHERE check_id = $1', [check])).rows[0].n, 0);
    assert.equal((await adminDb.query('SELECT stock FROM products WHERE id = $1', [t.productId])).rows[0].stock, 4);
    await adminDb.query('UPDATE products SET stock_enabled = false, stock = NULL WHERE id = $1', [t.productId]);
  });

  it('il conto non si salda con portate ancora da mandare', async () => {
    const check = await openCheck(tables[7]);
    const [, b] = (await send(check, [{ course_id: starter.id, seq: 1, items: [line()] }, { course_id: main.id, seq: 2, items: [line()] }])).body.orders;
    const pay = await admin.post(`/checks/${check}/payments`, { method: 'cash', amount: 10 });
    assert.equal(pay.status, 409);
    assert.equal(pay.body.code, 'COURSES_PENDING');
    assert.equal((await adminDb.query('SELECT COUNT(*)::int AS n FROM payments WHERE check_id = $1', [check])).rows[0].n, 0, 'il pagamento non è stato registrato');
    // un pagamento parziale va bene; poi si manda e si salda
    assert.equal((await admin.post(`/checks/${check}/payments`, { method: 'cash', amount: 4 })).status, 201);
    await admin.post(`/checks/${check}/fire`, {});
    const rest = await admin.post(`/checks/${check}/payments`, { method: 'cash', amount: 6 });
    assert.equal(rest.status, 201, JSON.stringify(rest.body));
    assert.equal(rest.body.check.status, 'paid');
    assert.ok(b.id);
  });

  it('un servizio non si chiude con portate da mandare (il conto è aperto)', async () => {
    const check = await openCheck((await admin.post(`/rooms/${(await admin.get('/rooms')).body[0].id}/tables`, { name: 'X1' })).body);
    await send(check, [{ course_id: starter.id, seq: 1, items: [line()] }, { course_id: main.id, seq: 2, items: [line()] }]);
    const end = await admin.post('/sessions/end', {});
    assert.equal(end.status, 409);
    assert.equal(end.body.code, 'OPEN_CHECKS');
  });

  it('regole: conto chiuso o inesistente, portata di un altro locale, forma, ruoli, sagra', async () => {
    const check = await openCheck((await admin.post(`/rooms/${(await admin.get('/rooms')).body[0].id}/tables`, { name: 'X2' })).body);
    const ok = [{ course_id: starter.id, seq: 1, items: [line()] }];
    assert.equal((await send(999999999, ok)).status, 404);
    const { rows: [foreign] } = await adminDb.query(`INSERT INTO courses (name, tenant_id) VALUES ('Altrui', $1) RETURNING id`, [sagra.id]);
    const bad = await send(check, [{ course_id: foreign.id, seq: 1, items: [line()] }]);
    assert.equal(bad.status, 400);
    assert.equal(bad.body.code, 'INVALID_COURSE');
    await adminDb.query('DELETE FROM courses WHERE id = $1', [foreign.id]);
    assert.equal((await send(check, [])).status, 400);
    assert.equal((await send(check, [{ course_id: starter.id, seq: 0, items: [line()] }])).status, 400);
    assert.equal((await send(check, [{ course_id: starter.id, seq: 1, items: [] }])).status, 400);
    assert.equal((await send(check, [{ course_id: starter.id, seq: 1, items: [line(1, 999999999)] }])).status, 400, 'prodotto inesistente');
    assert.equal((await send(check, [{ course_id: starter.id, seq: 1, items: [{ ...line(), type: 'gift' }] }])).status, 201, 'l\'admin può fare omaggi');
    assert.equal((await kitchen.post(`/checks/${check}/courses`, { groups: ok })).status, 403);
    assert.equal((await sagraApi.post(`/checks/${check}/courses`, { groups: ok })).status, 403, 'modulo spento');
    // un conto chiuso non riceve portate
    await admin.post(`/checks/${check}/void`, { cancel_orders: true });
    assert.equal((await send(check, ok)).status, 409);
  });

  it('eventi: la portata mandata arriva a cucina e KDS come comanda nuova, quella da mandare no', async () => {
    const staff = await connectWs(server.port, t.host, { cookie: admin.cookie });
    const kds = await connectWs(server.port, t.host, { publicKds: true });
    const room = (await admin.get('/rooms')).body[0];
    const check = await openCheck((await admin.post(`/rooms/${room.id}/tables`, { name: 'X3' })).body, 3);
    await send(check, [{ course_id: starter.id, seq: 1, items: [line()] }, { course_id: main.id, seq: 2, items: [line()] }]);
    await sleep(120);
    assert.equal(staff.messages.filter(m => m.type === 'order_created').length, 1, 'solo l\'antipasto');
    assert.equal(kds.messages.filter(m => m.type === 'order_created').length, 1);
    assert.ok(!('total' in kds.messages.find(m => m.type === 'order_created').order));

    await admin.post(`/checks/${check}/fire`, {});
    await sleep(120);
    const created = staff.messages.filter(m => m.type === 'order_created');
    assert.equal(created.length, 2);
    assert.equal(created[1].order.table_name, 'X3');
    assert.equal(kds.messages.filter(m => m.type === 'order_created').length, 2);
    assert.ok(staff.messages.some(m => m.type === 'check_updated'));
    staff.ws.close(); kds.ws.close();
    await admin.post(`/checks/${check}/void`, { cancel_orders: true });
  });
});
