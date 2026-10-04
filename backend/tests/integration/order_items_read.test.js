// Letture dalla tabella order_items: ogni punto che mostra un ordine deve dare le stesse righe che dava il JSONB,
// sia per gli ordini nuovi sia per quelli vecchi dalla forma irregolare.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, createTenant, deleteTenants, closePools, apiClient, adminDb } from './helpers.js';
import { scanTenant } from '../../utils/orderItemsBackfill.js';

const round2 = (n) => Math.round(n * 100) / 100;
const to8 = (n) => Math.round(n * 1e8) / 1e8; // il prezzo unitario si conserva a 8 decimali
const numOrNull = (v) => (v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

// Cosa diceva il JSONB, con i valori mancanti portati ai predefiniti che oggi dà la tabella.
const fromJson = (i) => ({
  id: numOrNull(i.id),
  name: i.name ?? '',
  quantity: i.quantity,
  price: to8(i.price),
  line_total: i.line_total ?? round2(i.price * i.quantity),
  original_price: numOrNull(i.original_price),
  type: i.type ?? 'sale',
  discountMode: i.discountMode ?? null,
  discountValue: numOrNull(i.discountValue),
  note: i.note ?? '',
  category: i.category ?? null,
  print_destination: i.print_destination ?? null,
});

const LEGACY = [
  { status: 'pending', items: [{ id: 1, name: 'Panino', price: 5, quantity: 2, note: '' }, { id: 2, name: 'Birra', price: 4, quantity: 1, note: 'fredda', print_destination: 'bar' }] },
  { status: 'preparing', items: [{ id: 3, name: 'Calzone', price: 2.5, quantity: 1, note: '', type: 'discount', discountMode: 'percent', discountValue: 50, original_price: 5, line_total: 2.5, category: 'Calzoni', print_destination: 'kitchen' }] },
  { status: 'completed', items: [{ id: 'abc', name: 'Prodotto vecchio', price: 3, quantity: 1 }, { id: 5, name: 'Combo', price: 1.6666666666666667, quantity: 3, line_total: 5 }] },
];

describe('order_items: letture', () => {
  let server, t, api;
  const orders = []; // { id, json }

  before(async () => {
    server = await startServer();
    t = await createTenant();
    api = apiClient(server.port, t.host);
    await api.login(t.username);

    for (const { status, items } of LEGACY) {
      const { rows: [o] } = await adminDb.query(
        `INSERT INTO orders (items, total, status, tenant_id, session_id, display_code) VALUES ($1, 10, $2, $3, $4, 'L') RETURNING id`,
        [JSON.stringify(items), status, t.id, t.sessionId]);
      orders.push({ id: o.id, json: items });
    }
    const client = await adminDb.connect();
    try {
      await client.query('SELECT set_config($1, $2, false)', ['app.tenant_id', String(t.id)]);
      await scanTenant(client, t.id, { apply: true });
    } finally { client.release(); }

    // un ordine nuovo, passato dall'API
    const res = await api.post('/orders', { items: [{ id: t.productId, name: 'x', quantity: 2, note: 'ben cotto' }], status: 'pending' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const { rows: [fresh] } = await adminDb.query('SELECT items FROM orders WHERE id = $1', [res.body.orderId]);
    orders.push({ id: res.body.orderId, json: fresh.items });
  });
  after(async () => {
    await deleteTenants(t);
    await server.close();
    await closePools();
  });

  const expectedItems = (o) => o.json.map(fromJson);

  it('GET /orders: stesse righe del JSONB (la categoria mancante si completa dal catalogo o diventa "Altro")', async () => {
    const res = await api.get('/orders?session=active');
    assert.equal(res.status, 200);
    for (const o of orders) {
      const got = res.body.find(x => x.id === o.id);
      assert.ok(got, `ordine ${o.id} presente`);
      assert.deepEqual(got.items.map(i => ({ ...i, category: undefined })), expectedItems(o).map(i => ({ ...i, category: undefined })));
      assert.ok(got.items.every(i => typeof i.category === 'string' && i.category), 'categoria sempre valorizzata');
    }
    // categoria del prodotto di catalogo per la riga che non ce l'ha
    const fresh = res.body.find(x => x.id === orders.at(-1).id);
    assert.equal(fresh.items[0].category, 'Cibo');
  });

  it('ristampa: l\'ordine con le sue righe', async () => {
    for (const o of orders) {
      const res = await api.post(`/orders/${o.id}/reprint`);
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.items, expectedItems(o));
      assert.equal(res.body.total > 0, true);
    }
    assert.equal((await api.post('/orders/999999999/reprint')).status, 404);
  });

  it('KDS pubblico: solo gli ordini in corso, con le righe ridotte e senza prezzi', async () => {
    const res = await apiClient(server.port, t.host).get('/orders/kds');
    assert.equal(res.status, 200);
    const ids = res.body.map(o => o.id).sort();
    assert.deepEqual(ids, orders.filter(o => o.id !== orders[2].id).map(o => o.id).sort(), 'l\'ordine completato non c\'è');
    const first = res.body.find(o => o.id === orders[0].id);
    assert.deepEqual(first.items, [{ id: 1, name: 'Panino', quantity: 2, note: '', category: null }, { id: 2, name: 'Birra', quantity: 1, note: 'fredda', category: null }]);
    assert.equal(JSON.stringify(res.body).includes('price'), false);
    assert.equal(JSON.stringify(res.body).includes('line_total'), false);
  });

  it('storno: ripristina lo stock dalle righe e restituisce l\'ordine con le righe', async () => {
    await adminDb.query('UPDATE products SET stock_enabled = true, stock = 10 WHERE id = $1', [t.productId]);
    const fresh = orders.at(-1);
    await adminDb.query('UPDATE products SET stock = 8 WHERE id = $1', [t.productId]); // 2 già venduti
    const res = await api.put(`/orders/${fresh.id}`, { status: 'canceled' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const { rows: [p] } = await adminDb.query('SELECT stock FROM products WHERE id = $1', [t.productId]);
    assert.equal(p.stock, 10, 'le 2 porzioni tornano disponibili');

    // un ordine vecchio con un id fuori catalogo si storna senza errori
    const legacy = orders[0];
    assert.equal((await api.put(`/orders/${legacy.id}`, { status: 'canceled' })).status, 200);
    const weird = orders[2];
    await adminDb.query(`UPDATE orders SET status = 'pending' WHERE id = $1`, [weird.id]);
    assert.equal((await api.put(`/orders/${weird.id}`, { status: 'canceled' })).status, 200);
  });

  it('CSV di sessione: una riga per riga d\'ordine con gli importi del JSONB', async () => {
    await adminDb.query(`UPDATE orders SET status = 'completed' WHERE tenant_id = $1`, [t.id]);
    const res = await api.get(`/exports/session/${t.sessionId}/csv`);
    assert.equal(res.status, 200);
    const lines = String(res.body).replace('﻿', '').split('\n');
    assert.equal(lines.length - 1, orders.reduce((n, o) => n + o.json.length, 0));
    const calzone = lines.find(l => l.includes('Calzone'));
    assert.match(calzone, /"Calzoni"/);
    assert.match(calzone, /;1;2,50;2,50;/);
    const combo = lines.find(l => l.includes('Combo'));
    assert.match(combo, /;3;1,67;5,00;/);
    const old = lines.find(l => l.includes('Prodotto vecchio'));
    assert.match(old, /"Generico"/);
  });
});
