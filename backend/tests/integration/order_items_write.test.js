// Doppia scrittura: ogni ordine nuovo scrive il JSONB e le righe in tabella, nella stessa transazione;
// un errore sulla copia non blocca mai la vendita.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'crypto';
import { startServer, createTenant, deleteTenants, closePools, apiClient, adminDb } from './helpers.js';
import { scanTenant, verifyTenant } from '../../utils/orderItemsBackfill.js';

describe('order_items: doppia scrittura', () => {
  let server, t, api, gift;

  const rowsOf = async (orderId) => (await adminDb.query('SELECT * FROM order_items WHERE order_id = $1 ORDER BY position', [orderId])).rows;
  const verify = async () => {
    const client = await adminDb.connect();
    try {
      await client.query('SELECT set_config($1, $2, false)', ['app.tenant_id', String(t.id)]);
      return await verifyTenant(client);
    } finally { client.release(); }
  };
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

  it('un ordine nuovo scrive le righe, uguali a quelle del JSONB', async () => {
    const res = await post([
      { id: t.productId, quantity: 2, note: 'senza cipolla' },
      { id: gift, quantity: 1, type: 'gift' },
    ]);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const rows = await rowsOf(res.body.orderId);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map(r => [r.position, Number(r.product_id), r.name, r.quantity, r.line_type, r.note]),
      [[0, t.productId, 'Panino', 2, 'sale', 'senza cipolla'], [1, gift, 'Bibita', 1, 'gift', '']]);
    assert.equal(Number(rows[0].line_total), 10);
    assert.equal(Number(rows[1].line_total), 0, 'omaggio: line_total a zero');
    assert.equal(rows[1].category, 'Bar');
    assert.equal(rows[1].print_destination, 'bar');
    assert.ok(rows.every(r => r.tenant_id === t.id));
    assert.equal((await verify()).errors, 0);
  });

  it('stesso client_order_id: un solo ordine e nessuna riga in più', async () => {
    const key = randomUUID();
    const first = await post([{ id: t.productId, quantity: 1 }], { client_order_id: key });
    const again = await post([{ id: t.productId, quantity: 1 }], { client_order_id: key });
    assert.equal(again.body.duplicate, true);
    assert.equal(again.body.orderId, first.body.orderId);
    assert.equal((await rowsOf(first.body.orderId)).length, 1);
    assert.equal((await verify()).errors, 0);
  });

  it('ordine rifiutato (prodotto inesistente o sessione chiusa): nessuna riga orfana', async () => {
    const before = (await adminDb.query('SELECT count(*)::int AS n FROM order_items WHERE tenant_id = $1', [t.id])).rows[0].n;
    assert.equal((await post([{ id: 999999999, quantity: 1 }])).status, 400);
    assert.equal((await post([{ id: t.productId, quantity: 1 }], { client_order_id: randomUUID(), session_id: 999999999, client_created_at: new Date().toISOString() })).status, 409);
    const after = (await adminDb.query('SELECT count(*)::int AS n FROM order_items WHERE tenant_id = $1', [t.id])).rows[0].n;
    assert.equal(after, before);
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

  it('se la copia in tabella fallisce, la vendita passa lo stesso e il backfill la ripara', async () => {
    await adminDb.query('ALTER TABLE order_items ADD CONSTRAINT zz_rompi_la_copia CHECK (false) NOT VALID');
    let res;
    try {
      res = await post([{ id: t.productId, quantity: 1 }]);
    } finally {
      await adminDb.query('ALTER TABLE order_items DROP CONSTRAINT zz_rompi_la_copia');
    }
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const { rows } = await adminDb.query('SELECT items FROM orders WHERE id = $1', [res.body.orderId]);
    assert.equal(rows[0].items.length, 1, 'il JSONB è stato scritto');
    assert.equal((await rowsOf(res.body.orderId)).length, 0, 'la copia manca');

    const broken = await verify();
    assert.equal(broken.counts.manca_riga, 1);

    const client = await adminDb.connect();
    try {
      await client.query('SELECT set_config($1, $2, false)', ['app.tenant_id', String(t.id)]);
      const fixed = await scanTenant(client, t.id, { apply: true });
      assert.equal(fixed.rows, 1);
    } finally { client.release(); }
    assert.equal((await verify()).errors, 0);
  });

  it('stock e totali di sempre non cambiano', async () => {
    const before = (await adminDb.query('SELECT count(*)::int AS n, sum(total) AS total FROM orders WHERE tenant_id = $1', [t.id])).rows[0];
    const res = await post([{ id: t.productId, quantity: 2 }]);
    assert.equal(res.status, 200);
    const after = (await adminDb.query('SELECT count(*)::int AS n, sum(total) AS total FROM orders WHERE tenant_id = $1', [t.id])).rows[0];
    assert.equal(after.n, before.n + 1);
    assert.equal(Number(after.total), Number(before.total) + 10);
  });
});
