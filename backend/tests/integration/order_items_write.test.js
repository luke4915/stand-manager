// Scrittura delle righe d'ordine: sono parte dell'ordine, nella stessa transazione.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'crypto';
import { startServer, createTenant, deleteTenants, closePools, apiClient, adminDb } from './helpers.js';

describe('order_items: scrittura', () => {
  let server, t, api, gift;

  const rowsOf = async (orderId) => (await adminDb.query('SELECT * FROM order_items WHERE order_id = $1 ORDER BY position', [orderId])).rows;
  const countOf = async (table) => (await adminDb.query(`SELECT count(*)::int AS n FROM ${table} WHERE tenant_id = $1`, [t.id])).rows[0].n;
  const post = (items, extra = {}) => api.post('/orders', { items: items.map(i => ({ name: 'x', ...i })), status: 'completed', ...extra });

  before(async () => {
    server = await startServer();
    t = await createTenant();
    gift = (await adminDb.query(`INSERT INTO products (name, price, category, tenant_id, print_destination) VALUES ('Bibita', 2, 'Bar', $1, 'bar') RETURNING id`, [t.id])).rows[0].id;
    api = apiClient(server.port, t.host);
    await api.login(t.username);
  });
  after(async () => {
    await deleteTenants(t);
    await server.close();
    await closePools();
  });

  it('un ordine nuovo scrive le sue righe, con i valori ricalcolati dal server', async () => {
    const res = await post([
      { id: t.productId, quantity: 2, note: 'senza cipolla' },
      { id: gift, quantity: 1, type: 'gift' },
    ]);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const rows = await rowsOf(res.body.orderId);
    assert.deepEqual(rows.map(r => [r.position, Number(r.product_id), r.name, r.quantity, r.line_type, r.note]),
      [[0, t.productId, 'Panino', 2, 'sale', 'senza cipolla'], [1, gift, 'Bibita', 1, 'gift', '']]);
    assert.equal(Number(rows[0].line_total), 10);
    assert.equal(Number(rows[1].line_total), 0, 'omaggio: line_total a zero');
    assert.equal(Number(rows[1].original_price), 2, 'il mancato incasso si legge dal listino');
    assert.equal(rows[1].category, 'Bar');
    assert.equal(rows[1].print_destination, 'bar');
    assert.ok(rows.every(r => r.tenant_id === t.id));
    const { rows: [order] } = await adminDb.query('SELECT items, total FROM orders WHERE id = $1', [res.body.orderId]);
    assert.equal(order.items, null, 'il JSONB non si scrive più');
    assert.equal(Number(order.total), 10);
  });

  it('stesso client_order_id: un solo ordine e nessuna riga in più', async () => {
    const key = randomUUID();
    const first = await post([{ id: t.productId, quantity: 1 }], { client_order_id: key });
    const again = await post([{ id: t.productId, quantity: 1 }], { client_order_id: key });
    assert.equal(again.body.duplicate, true);
    assert.equal(again.body.orderId, first.body.orderId);
    assert.equal((await rowsOf(first.body.orderId)).length, 1);
  });

  it('ordine rifiutato (prodotto inesistente o sessione chiusa): nessuna riga orfana', async () => {
    const before = await countOf('order_items');
    assert.equal((await post([{ id: 999999999, quantity: 1 }])).status, 400);
    assert.equal((await post([{ id: t.productId, quantity: 1 }], { client_order_id: randomUUID(), session_id: 999999999, client_created_at: new Date().toISOString() })).status, 409);
    assert.equal(await countOf('order_items'), before);
  });

  it('lo storno cambia lo stato dell\'ordine e lascia le righe com\'erano', async () => {
    const res = await post([{ id: t.productId, quantity: 3 }]);
    const rowsBefore = await rowsOf(res.body.orderId);
    assert.equal((await api.put(`/orders/${res.body.orderId}`, { status: 'canceled' })).status, 200);
    assert.deepEqual(await rowsOf(res.body.orderId), rowsBefore);
  });

  it('ordine in ritardo (offline) in una sessione chiusa: righe scritte come per gli altri', async () => {
    await adminDb.query(`UPDATE sessions SET end_time = now() WHERE id = $1`, [t.sessionId]);
    const res = await post([{ id: t.productId, quantity: 1 }], { client_order_id: randomUUID(), session_id: t.sessionId, client_created_at: new Date(Date.now() - 60_000).toISOString() });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal((await rowsOf(res.body.orderId)).length, 1);
    await adminDb.query(`UPDATE sessions SET end_time = NULL WHERE id = $1`, [t.sessionId]);
  });

  it('se le righe non si possono scrivere l\'ordine non nasce, e stock e totali restano come prima', async () => {
    await adminDb.query('UPDATE products SET stock_enabled = true, stock = 10 WHERE id = $1', [t.productId]);
    const orders = await countOf('orders');
    await adminDb.query('ALTER TABLE order_items ADD CONSTRAINT zz_rompi_le_righe CHECK (false) NOT VALID');
    let res;
    try {
      res = await post([{ id: t.productId, quantity: 2 }]);
    } finally {
      await adminDb.query('ALTER TABLE order_items DROP CONSTRAINT zz_rompi_le_righe');
    }
    assert.equal(res.status, 500);
    assert.equal(await countOf('orders'), orders, 'nessun ordine senza righe');
    assert.equal((await adminDb.query('SELECT stock FROM products WHERE id = $1', [t.productId])).rows[0].stock, 10, 'lo stock non scala');
    await adminDb.query('UPDATE products SET stock_enabled = false, stock = NULL WHERE id = $1', [t.productId]);
    assert.equal((await post([{ id: t.productId, quantity: 1 }])).status, 200, 'e dopo il guasto si torna a vendere');
  });
});
