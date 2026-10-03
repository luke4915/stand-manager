// Ordini: codici e stock con casse concorrenti, storni, idempotenza, sincronizzazione in ritardo.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'crypto';
import { startServer, createTenant, deleteTenants, closePools, apiClient, adminDb } from './helpers.js';

const row = async (sql, params) => (await adminDb.query(sql, params)).rows[0];

describe('ordini', () => {
  let server, t, api, panino;

  before(async () => {
    server = await startServer();
    t = await createTenant();
    api = apiClient(server.port, t.host);
    await api.login(t.username);
    panino = (quantity = 1, extra = {}) => ({ items: [{ id: t.productId, name: 'Panino', quantity }], status: 'completed', ...extra });
  });

  after(async () => {
    await deleteTenants(t);
    await server.close();
    await closePools();
  });

  const setStock = (stock) => adminDb.query('UPDATE products SET stock_enabled = true, stock = $1, visible = true WHERE id = $2', [stock, t.productId]);
  const productRow = () => row('SELECT stock, stock_enabled, visible FROM products WHERE id = $1', [t.productId]);

  it('20 ordini contemporanei su stock 10: 10 accettati con codici distinti, stock mai negativo', async () => {
    await setStock(10);
    const results = await Promise.all(Array.from({ length: 20 }, () => api.post('/orders', panino())));
    const ok = results.filter(r => r.status === 200);
    const rejected = results.filter(r => r.status === 409);
    assert.equal(ok.length, 10);
    assert.ok(rejected.every(r => r.body.code === 'OUT_OF_STOCK'));
    const codes = ok.map(r => r.body.displayCode).sort((x, y) => x.slice(1) - y.slice(1));
    assert.deepEqual(codes, Array.from({ length: 10 }, (_, i) => `A${i + 1}`));
    assert.deepEqual(await productRow(), { stock: 0, stock_enabled: true, visible: false });
  });

  it('righe dello stesso prodotto scalano la somma, lo storno la ripristina una volta sola', async () => {
    await setStock(5);
    const res = await api.post('/orders', {
      items: [{ id: t.productId, name: 'Panino', quantity: 2 }, { id: t.productId, name: 'Panino', quantity: 2, type: 'gift' }],
    });
    assert.equal(res.status, 200);
    assert.equal((await productRow()).stock, 1);
    assert.equal((await api.put(`/orders/${res.body.orderId}`, { status: 'canceled' })).status, 200);
    assert.equal((await productRow()).stock, 5);
    assert.equal((await api.put(`/orders/${res.body.orderId}`, { status: 'canceled' })).status, 409);
    assert.equal((await productRow()).stock, 5);
  });

  it('stesso client_order_id, anche in invii contemporanei: un solo ordine', async () => {
    await setStock(100);
    const key = randomUUID();
    const results = await Promise.all(Array.from({ length: 5 }, () => api.post('/orders', panino(1, { client_order_id: key }))));
    assert.ok(results.every(r => r.status === 200));
    assert.equal(new Set(results.map(r => r.body.orderId)).size, 1);
    assert.equal((await productRow()).stock, 99);
  });

  it('ordine offline per una sessione chiusa: entra in quella sessione e aggiorna il totale atteso', async () => {
    const battutoAlle = new Date().toISOString();
    const closed = await api.post('/sessions/end', { declaredCash: 0 });
    await api.post('/sessions/start', { name: 'Serata successiva' });
    const res = await api.post('/orders', panino(2, { status: 'pending', client_order_id: randomUUID(), session_id: t.sessionId, client_created_at: battutoAlle }));
    assert.equal(res.status, 200);
    const order = await row('SELECT session_id, status FROM orders WHERE id = $1', [res.body.orderId]);
    assert.deepEqual(order, { session_id: t.sessionId, status: 'completed' });
    const session = await row('SELECT expected_cash FROM sessions WHERE id = $1', [t.sessionId]);
    assert.equal(Number(session.expected_cash), Number(closed.body.expected_cash) + 10);
  });

  it('ordine offline per una sessione chiusa da più di 24 ore: 409 SESSION_CLOSED', async () => {
    await adminDb.query(`UPDATE sessions SET start_time = now() - interval '30 hours', end_time = now() - interval '25 hours' WHERE id = $1`, [t.sessionId]);
    const res = await api.post('/orders', panino(1, { client_order_id: randomUUID(), session_id: t.sessionId, client_created_at: new Date().toISOString() }));
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'SESSION_CLOSED');
  });

  it('apertura sessione: stock illimitato per tutti i prodotti; senza sessione nessun ordine', async () => {
    await api.post('/sessions/end', {});
    assert.equal((await api.post('/orders', panino())).body.code, 'NO_ACTIVE_SESSION');
    await setStock(0);
    await api.post('/sessions/start', { name: 'Nuova serata' });
    assert.deepEqual(await productRow(), { stock: null, stock_enabled: false, visible: true });
  });
});
