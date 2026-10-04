// Pagamenti dei conti (passo 2-5 e pagamento per voce): importo, voci, resto, abbuono, annullo, ricevuta.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { startServer, createTenant, deleteTenants, closePools, apiClient, adminDb, connectWs, sleep, PASSWORD } from './helpers.js';

process.env.MASTER_JWT_SECRET ||= 'segreto-master-di-prova-lungo-almeno-32-caratteri';
const masterCookie = { cookie: `master_token=${jwt.sign({ master: true }, process.env.MASTER_JWT_SECRET)}` };

describe('pagamenti dei conti', () => {
  let server, t, other, admin, cashier, manager, kitchen, otherAdmin, tables, beer, pizza;

  const addUser = async (role) => {
    const username = `${role}-${t.slug}`;
    await adminDb.query(`INSERT INTO users (username, password_hash, role, tenant_id) VALUES ($1, $2, $3, $4)`, [username, await bcrypt.hash(PASSWORD, 4), role, t.id]);
    const api = apiClient(server.port, t.host);
    await api.login(username);
    return api;
  };
  const addProduct = async (name, price, extra = '') =>
    (await adminDb.query(`INSERT INTO products (name, price, category, tenant_id ${extra ? ', stock_enabled, stock' : ''}) VALUES ($1, $2, 'Cibo', $3 ${extra ? ', true, 10' : ''}) RETURNING id`, [name, price, t.id])).rows[0].id;

  let nextTable = 0;
  // Apre un conto e vi invia delle comande: [[prodotto, quantità], …] per comanda
  const newCheck = async (...orders) => {
    const check = (await admin.post('/checks', { table_id: tables[nextTable++].id, covers: 2 })).body.id;
    for (const lines of orders) {
      const res = await admin.post('/orders', { items: lines.map(([id, quantity]) => ({ id, name: 'x', quantity })), check_id: check });
      assert.equal(res.status, 200, JSON.stringify(res.body));
    }
    return check;
  };
  const detail = async (id) => (await admin.get(`/checks/${id}`)).body;
  const lineOf = async (check, name) => (await detail(check)).orders.flatMap(o => o.items).find(i => i.name === name);
  const pay = (check, body, api = admin) => api.post(`/checks/${check}/payments`, body);

  before(async () => {
    server = await startServer();
    [t, other] = [await createTenant({ businessType: 'ristorante' }), await createTenant({ businessType: 'ristorante' })];
    admin = apiClient(server.port, t.host);
    await admin.login(t.username);
    otherAdmin = apiClient(server.port, other.host);
    await otherAdmin.login(other.username);
    [cashier, manager, kitchen] = [await addUser('cassa'), await addUser('responsabile'), await addUser('cucina')];
    beer = await addProduct('Birra', 4.5);
    pizza = await addProduct('Pizza', 10);
    const room = (await admin.post('/rooms', { name: 'Sala' })).body;
    tables = (await admin.post(`/rooms/${room.id}/tables/bulk`, { prefix: 'T', from: 1, to: 30 })).body.created;
  });
  after(async () => {
    await deleteTenants(t, other);
    await server.close();
    await closePools();
  });

  it('pagamento a importo: parziale, poi il resto; il conto si chiude da solo a residuo zero', async () => {
    const check = await newCheck([[t.productId, 2]]);                       // 10 €
    const first = await pay(check, { method: 'cash', amount: 4 });
    assert.equal(first.status, 201, JSON.stringify(first.body));
    assert.deepEqual([first.body.check.paid, first.body.check.due, first.body.check.status], [4, 6, 'open']);
    const rest = await pay(check, { method: 'card', amount: 6 });
    assert.equal(rest.body.check.status, 'paid');
    assert.ok(rest.body.check.closed_at);
    const d = await detail(check);
    assert.deepEqual(d.payments.map(p => [p.method, p.amount]), [['cash', 4], ['card', 6]]);
    assert.equal((await pay(check, { method: 'cash', amount: 1 })).body.code, 'CHECK_CLOSED');
  });

  it('importi non validi o oltre il residuo', async () => {
    const check = await newCheck([[t.productId, 1]]);                       // 5 €
    const over = await pay(check, { method: 'cash', amount: 5.01 });
    assert.equal(over.status, 409);
    assert.equal(over.body.code, 'AMOUNT_EXCEEDS_DUE');
    for (const body of [{ method: 'cash' }, { method: 'cash', amount: 0 }, { method: 'cash', amount: -1 }, { method: 'cash', amount: 1.005 },
      { method: 'bitcoin', amount: 1 }, { method: 'cash', amount: 1, items: [{ order_item_id: 1, quantity: 1 }] }, { method: 'cash', items: [] }])
      assert.equal((await pay(check, body)).status, 400, JSON.stringify(body));
    assert.equal((await pay(999999999, { method: 'cash', amount: 1 })).status, 404);
    assert.equal((await detail(check)).payments.length, 0);
  });

  it('contanti consegnati e resto; il resto non si registra e senza contanti non ha senso', async () => {
    const check = await newCheck([[t.productId, 2]]);                       // 10 €
    const res = await pay(check, { method: 'cash', amount: 7.5, tendered: 10 });
    assert.equal(res.body.change, 2.5);
    assert.equal((await pay(check, { method: 'cash', amount: 2.5, tendered: 2 })).body.code, 'TENDERED_TOO_LOW');
    assert.equal((await pay(check, { method: 'card', amount: 2.5, tendered: 3 })).status, 400);
    assert.equal((await detail(check)).payments.length, 1, 'il pagamento rifiutato non lascia tracce');
  });

  it('pagamento per voce: conti separati, quantità a pezzi, quote che sommano il totale di riga', async () => {
    const check = await newCheck([[t.productId, 2], [beer, 1]], [[pizza, 1]]);   // 10 + 4.5 + 10
    const panino = await lineOf(check, 'Panino');
    const birra = await lineOf(check, 'Birra');
    assert.deepEqual([panino.paid_quantity, panino.remaining_quantity, panino.remaining_amount], [0, 2, 10]);

    const one = await pay(check, { method: 'cash', items: [{ order_item_id: panino.line_id, quantity: 1 }, { order_item_id: birra.line_id, quantity: 1 }] });
    assert.equal(one.status, 201, JSON.stringify(one.body));
    assert.equal(one.body.payment.amount, 9.5, '5 + 4,5, calcolato dal server');
    assert.equal(one.body.check.due, 15);

    const after1 = await lineOf(check, 'Panino');
    assert.deepEqual([after1.paid_quantity, after1.remaining_quantity, after1.remaining_amount], [1, 1, 5]);
    const tooMany = await pay(check, { method: 'cash', items: [{ order_item_id: birra.line_id, quantity: 1 }] });
    assert.equal(tooMany.status, 409);
    assert.equal(tooMany.body.code, 'ITEM_ALREADY_PAID');
    assert.equal((await pay(check, { method: 'cash', items: [{ order_item_id: 999999999, quantity: 1 }] })).body.code, 'ITEM_NOT_FOUND');

    const d = await detail(check);
    assert.deepEqual(d.payments[0].items.map(i => [i.name, i.quantity, i.amount]), [['Panino', 1, 5], ['Birra', 1, 4.5]]);

    // chi resta paga il resto: ultima quota del panino + la pizza
    const pizzaLine = await lineOf(check, 'Pizza');
    const last = await pay(check, { method: 'card', items: [{ order_item_id: panino.line_id, quantity: 1 }, { order_item_id: pizzaLine.line_id, quantity: 1 }] });
    assert.equal(last.body.payment.amount, 15);
    assert.equal(last.body.check.status, 'paid');
  });

  it('la quota delle voci non perde centesimi: l\'ultima prende il resto', async () => {
    const check = await newCheck([[pizza, 3]]);                              // 30 €
    const line = await lineOf(check, 'Pizza');
    const adjusted = await admin.post(`/checks/${check}/adjust`, { order_item_ids: [line.line_id], type: 'discount', discountMode: 'amount', discountValue: 0.01 });
    assert.equal(adjusted.body.total, 29.99);
    const amounts = [];
    for (let i = 0; i < 3; i++) amounts.push((await pay(check, { method: 'cash', items: [{ order_item_id: line.line_id, quantity: 1 }] })).body.payment.amount);
    assert.deepEqual(amounts, [10, 10, 9.99]);
    assert.equal((await detail(check)).status, 'paid');
  });

  it('pagamento a importo e per voce insieme: il residuo vale per entrambi', async () => {
    const check = await newCheck([[pizza, 1], [beer, 2]]);                   // 10 + 9
    const pizzaLine = await lineOf(check, 'Pizza');
    const beerLine = await lineOf(check, 'Birra');
    assert.equal((await pay(check, { method: 'cash', amount: 15 })).body.check.due, 4);
    const tooMuch = await pay(check, { method: 'cash', items: [{ order_item_id: beerLine.line_id, quantity: 2 }] });   // 9 > 4
    assert.equal(tooMuch.body.code, 'AMOUNT_EXCEEDS_DUE');
    assert.equal((await pay(check, { method: 'card', amount: 4 })).body.check.status, 'paid');
    assert.ok(pizzaLine);
  });

  it('abbuono: omaggio e sconto sulle voci, solo ruoli sconto, non su voci già pagate', async () => {
    const check = await newCheck([[pizza, 2], [beer, 2]]);                   // 20 + 9
    const pizzaLine = await lineOf(check, 'Pizza');
    const beerLine = await lineOf(check, 'Birra');
    const body = (ids, extra) => ({ order_item_ids: ids, ...extra });

    assert.equal((await cashier.post(`/checks/${check}/adjust`, body([pizzaLine.line_id], { type: 'gift' }))).status, 403);
    assert.equal((await kitchen.post(`/checks/${check}/adjust`, body([pizzaLine.line_id], { type: 'gift' }))).status, 403);
    assert.equal((await manager.post(`/checks/${check}/adjust`, body([beerLine.line_id], { type: 'discount', discountMode: 'percent', discountValue: 50 }))).body.total, 24.5);
    assert.equal((await admin.post(`/checks/${check}/adjust`, body([pizzaLine.line_id], { type: 'gift' }))).body.total, 4.5);
    const adjusted = await lineOf(check, 'Pizza');
    assert.deepEqual([adjusted.type, adjusted.line_total, adjusted.original_price], ['gift', 0, 10]);
    const { rows: [order] } = await adminDb.query(`SELECT order_type, total FROM orders WHERE check_id = $1`, [check]);
    assert.deepEqual([order.order_type, Number(order.total)], ['discount', 4.5]);

    // togliere l'abbuono riporta il prezzo di listino
    assert.equal((await admin.post(`/checks/${check}/adjust`, body([pizzaLine.line_id], { type: 'sale' }))).body.total, 24.5);

    assert.equal((await pay(check, { method: 'cash', items: [{ order_item_id: beerLine.line_id, quantity: 1 }] })).status, 201);
    const paidLine = await admin.post(`/checks/${check}/adjust`, body([beerLine.line_id], { type: 'gift' }));
    assert.equal(paidLine.status, 409);
    assert.equal(paidLine.body.code, 'ITEM_PAID');

    assert.equal((await admin.post(`/checks/${check}/adjust`, body([999999999], { type: 'gift' }))).status, 404);
    assert.equal((await admin.post(`/checks/${check}/adjust`, body([pizzaLine.line_id], { type: 'discount' }))).status, 400, 'sconto senza valore');
  });

  it('omaggio su tutto il conto: residuo zero, si chiude con /close; con residuo no', async () => {
    const check = await newCheck([[pizza, 1]]);
    const line = await lineOf(check, 'Pizza');
    assert.equal((await admin.post(`/checks/${check}/close`, {})).body.code, 'CHECK_NOT_SETTLED');
    await admin.post(`/checks/${check}/adjust`, { order_item_ids: [line.line_id], type: 'gift' });
    const closed = await admin.post(`/checks/${check}/close`, {});
    assert.equal(closed.status, 200);
    assert.equal(closed.body.status, 'paid');
    assert.equal((await admin.post(`/checks/${check}/close`, {})).body.code, 'CHECK_CLOSED');
  });

  it('storno di una comanda: non sotto il già pagato, non se ne è stata pagata una parte', async () => {
    const check = await newCheck([[pizza, 1]], [[t.productId, 1]], [[beer, 1]]);   // comande da 10, 5 e 4,5
    const orders = (await detail(check)).orders;
    await pay(check, { method: 'cash', amount: 8 });
    const blocked = await admin.put(`/orders/${orders[0].id}`, { status: 'canceled' });   // resterebbero 9,5 ≥ 8: si può
    assert.equal(blocked.status, 200);
    const tooLow = await admin.put(`/orders/${orders[1].id}`, { status: 'canceled' });    // resterebbero 4,5 < 8
    assert.equal(tooLow.status, 409);
    assert.equal(tooLow.body.code, 'ORDER_PAID');

    const line = await lineOf(check, 'Birra');
    await pay(check, { method: 'cash', items: [{ order_item_id: line.line_id, quantity: 1 }] });
    const partlyPaid = await admin.put(`/orders/${orders[2].id}`, { status: 'canceled' });
    assert.equal(partlyPaid.body.code, 'ORDER_PAID', 'una sua voce è già stata pagata');
    assert.equal((await detail(check)).orders.length, 3);
  });

  it('annullo del conto: senza comande, con pagamenti, e eliminazione con le comande (solo admin, lo stock torna)', async () => {
    const stocked = await addProduct('Vino', 6, 'stock');
    const empty = await newCheck();
    assert.equal((await cashier.post(`/checks/${empty}/void`, {})).status, 403);
    assert.equal((await manager.post(`/checks/${empty}/void`, {})).body.status, 'void');

    const check = await newCheck([[stocked, 3]], [[pizza, 1]]);
    assert.equal((await adminDb.query('SELECT stock FROM products WHERE id = $1', [stocked])).rows[0].stock, 7);
    assert.equal((await admin.post(`/checks/${check}/void`, {})).body.code, 'CHECK_HAS_ORDERS');
    const asManager = await manager.post(`/checks/${check}/void`, { cancel_orders: true });
    assert.equal(asManager.status, 403, 'le comande le elimina solo l\'admin');

    const staff = await connectWs(server.port, t.host, { cookie: admin.cookie });
    const gone = await admin.post(`/checks/${check}/void`, { cancel_orders: true });
    assert.equal(gone.status, 200, JSON.stringify(gone.body));
    assert.equal(gone.body.status, 'void');
    await sleep(100);
    assert.equal(staff.messages.filter(m => m.type === 'order_updated' && m.order.status === 'canceled').length, 2);
    staff.ws.close();
    assert.equal((await adminDb.query('SELECT stock FROM products WHERE id = $1', [stocked])).rows[0].stock, 10, 'stock ripristinato');
    assert.equal((await adminDb.query(`SELECT count(*)::int AS n FROM orders WHERE check_id = $1 AND status <> 'canceled'`, [check])).rows[0].n, 0);
    assert.equal((await admin.post('/checks', { table_id: (await detail(check)).table_id, covers: 1 })).status, 201, 'il tavolo è di nuovo libero');

    const paid = await newCheck([[pizza, 1]]);
    await pay(paid, { method: 'cash', amount: 3 });
    assert.equal((await admin.post(`/checks/${paid}/void`, { cancel_orders: true })).body.code, 'CHECK_HAS_PAYMENTS');
  });

  it('chi può incassare: cassa e responsabile sì, cucina no, altro locale non vede il conto', async () => {
    const check = await newCheck([[pizza, 1]]);
    assert.equal((await pay(check, { method: 'cash', amount: 1 }, kitchen)).status, 403);
    assert.equal((await pay(check, { method: 'cash', amount: 1 }, cashier)).status, 201);
    assert.equal((await pay(check, { method: 'cash', amount: 1 }, manager)).status, 201);
    assert.equal((await pay(check, { method: 'cash', amount: 1 }, otherAdmin)).status, 404);
    assert.equal((await otherAdmin.get(`/checks/${check}/receipt`)).status, 404);
    assert.equal((await apiClient(server.port, t.host).post(`/checks/${check}/payments`, { method: 'cash', amount: 1 })).status, 401);
    const { rows: [p] } = await adminDb.query('SELECT paid_by FROM payments WHERE check_id = $1 ORDER BY id LIMIT 1', [check]);
    assert.ok(p.paid_by, 'si sa chi ha incassato');
  });

  it('pagamenti contemporanei: il conto non si incassa due volte', async () => {
    const check = await newCheck([[pizza, 1]]);                              // 10 €
    const results = await Promise.all(Array.from({ length: 4 }, () => pay(check, { method: 'cash', amount: 10 })));
    assert.equal(results.filter(r => r.status === 201).length, 1);
    assert.ok(results.filter(r => r.status === 409).every(r => ['CHECK_CLOSED', 'AMOUNT_EXCEEDS_DUE'].includes(r.body.code)));
    assert.equal((await detail(check)).payments.length, 1);
  });

  it('pagamento e nuova comanda insieme: o la comanda entra prima del pagamento, o trova il conto chiuso', async () => {
    const check = await newCheck([[pizza, 1]]);
    const [payment, order] = await Promise.all([
      pay(check, { method: 'cash', amount: 10 }),
      admin.post('/orders', { items: [{ id: beer, name: 'Birra', quantity: 1 }], check_id: check }),
    ]);
    const d = await detail(check);
    if (order.status === 200) {
      assert.equal(payment.status, 201);
      assert.equal(d.status, 'open', 'comanda entrata prima: il conto resta aperto');
      assert.equal(d.due, 4.5);
    } else {
      assert.equal(order.body.code, 'CHECK_CLOSED');
      assert.equal(d.status, 'paid');
    }
  });

  it('ricevuta non fiscale: di tutto il conto e di un singolo pagamento', async () => {
    const check = await newCheck([[t.productId, 2], [beer, 1]]);             // 10 + 4,5
    const panino = await lineOf(check, 'Panino');
    const first = (await pay(check, { method: 'cash', items: [{ order_item_id: panino.line_id, quantity: 1 }] })).body.payment;
    const second = (await pay(check, { method: 'card', amount: 3 })).body.payment;

    const whole = (await admin.get(`/checks/${check}/receipt`)).body;
    assert.equal(whole.scope, 'check');
    assert.deepEqual([whole.total, whole.paid, whole.due], [14.5, 8, 6.5]);
    assert.deepEqual(whole.lines.map(l => [l.name, l.quantity, l.amount]), [['Panino', 2, 10], ['Birra', 1, 4.5]]);
    assert.equal(whole.check.table_name.startsWith('T'), true);
    assert.equal(whole.payments.length, 2);

    const part = (await admin.get(`/checks/${check}/receipt?payment_id=${first.id}`)).body;
    assert.equal(part.scope, 'payment');
    assert.deepEqual(part.lines, [{ name: 'Panino', quantity: 1, amount: 5 }]);
    const byAmount = (await admin.get(`/checks/${check}/receipt?payment_id=${second.id}`)).body;
    assert.deepEqual(byAmount.lines, [{ name: 'Pagamento a importo', quantity: 1, amount: 3 }]);
    assert.equal((await admin.get(`/checks/${check}/receipt?payment_id=999999999`)).status, 404);
  });

  it('i pagamenti sono incasso al momento giusto: contanti nel cassetto, carta no', async () => {
    const before = (await admin.get('/sessions/expected-cash')).body.expected;
    const check = await newCheck([[pizza, 2]]);                              // 20 €
    await pay(check, { method: 'cash', amount: 5 });
    assert.equal((await admin.get('/sessions/expected-cash')).body.expected, before + 5, 'il contante parziale è già nel cassetto');
    await pay(check, { method: 'card', amount: 15 });
    assert.equal((await admin.get('/sessions/expected-cash')).body.expected, before + 5, 'la carta no');
    const stats = (await admin.get(`/stats?sessions=${t.sessionId}&tz=Europe/Rome`)).body;
    assert.ok(stats.totaleSerata >= 20, 'a conto pagato le comande sono incasso');
  });

  it('evento in tempo reale a ogni pagamento, e pulizia con il tenant', async () => {
    const staff = await connectWs(server.port, t.host, { cookie: admin.cookie });
    const check = await newCheck([[pizza, 1]]);
    await pay(check, { method: 'cash', amount: 4 });
    await sleep(100);
    const event = staff.messages.filter(m => m.type === 'check_updated').pop();
    assert.deepEqual([event.check.id, event.check.paid, event.check.due], [check, 4, 6]);
    staff.ws.close();

    const doomed = await createTenant({ businessType: 'ristorante' });
    const api = apiClient(server.port, doomed.host);
    await api.login(doomed.username);
    const room = (await api.post('/rooms', { name: 'S' })).body;
    const table = (await api.post(`/rooms/${room.id}/tables`, { name: 'T1' })).body;
    const c = (await api.post('/checks', { table_id: table.id, covers: 1 })).body.id;
    await api.post('/orders', { items: [{ id: doomed.productId, name: 'x', quantity: 1 }], check_id: c });
    const line = (await api.get(`/checks/${c}`)).body.orders[0].items[0];
    assert.equal((await api.post(`/checks/${c}/payments`, { method: 'cash', items: [{ order_item_id: line.line_id, quantity: 1 }] })).status, 201);
    const res = await apiClient(server.port, doomed.host).request('DELETE', `/master/tenants/${doomed.id}`, { confirmSlug: doomed.slug }, masterCookie);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    for (const table of ['payment_items', 'payments', 'checks'])
      assert.equal((await adminDb.query(`SELECT count(*)::int AS n FROM ${table} WHERE tenant_id = $1`, [doomed.id])).rows[0].n, 0, table);
  });
});
