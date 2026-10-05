// Letture dalla tabella order_items: ogni punto che mostra un ordine dà le righe giuste, sia per gli ordini nuovi sia
// per quelli di vecchio stampo dalla forma irregolare (senza line_total, senza categoria, id fuori catalogo).
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, createTenant, deleteTenants, closePools, apiClient, adminDb } from './helpers.js';
import { toOrderItemRows } from '../../utils/orderItems.js';
import { insertOrderItemRows } from '../../utils/orderItemsWrite.js';

const round2 = (n) => Math.round(n * 100) / 100;
const to8 = (n) => Math.round(n * 1e8) / 1e8; // il prezzo unitario si conserva a 8 decimali
const numOrNull = (v) => (v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

// Le righe come le dava l'app fin dall'inizio, con i valori mancanti portati ai predefiniti della tabella.
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

    // ordini di vecchio stampo: righe irregolari, scritte con la stessa mappatura che usa l'app
    for (const { status, items } of LEGACY) {
      const { rows: [o] } = await adminDb.query(
        `INSERT INTO orders (total, status, tenant_id, session_id, display_code) VALUES (10, $1, $2, $3, 'L') RETURNING id`,
        [status, t.id, t.sessionId]);
      await insertOrderItemRows(adminDb, t.id, toOrderItemRows(items).rows.map(r => ({ ...r, order_id: o.id })));
      orders.push({ id: o.id, json: items });
    }

    // un ordine nuovo, passato dall'API
    const res = await api.post('/orders', { items: [{ id: t.productId, name: 'x', quantity: 2, note: 'ben cotto' }], status: 'pending' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    orders.push({ id: res.body.orderId, json: [{ id: t.productId, name: 'Panino', quantity: 2, price: 5, line_total: 10, original_price: 5, note: 'ben cotto', category: 'Cibo', type: 'sale', print_destination: 'both' }] });
  });
  after(async () => {
    await deleteTenants(t);
    await server.close();
    await closePools();
  });

  const expectedItems = (o) => o.json.map(fromJson);
  // `line_id`, `prep_status` (stato per riga, 041) e `modifiers` (043) sono campi in più: la forma storica dell'API resta quella di sempre
  const legacy = ({ line_id, prep_status, modifiers, ...item }) => { assert.ok(line_id && prep_status && Array.isArray(modifiers)); return item; };

  it('GET /orders: le righe attese (la categoria mancante si completa dal catalogo o diventa "Altro")', async () => {
    const res = await api.get('/orders?session=active');
    assert.equal(res.status, 200);
    for (const o of orders) {
      const got = res.body.find(x => x.id === o.id);
      assert.ok(got, `ordine ${o.id} presente`);
      assert.deepEqual(got.items.map(legacy).map(i => ({ ...i, category: undefined })), expectedItems(o).map(i => ({ ...i, category: undefined })));
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
      assert.deepEqual(res.body.items.map(legacy), expectedItems(o));
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
