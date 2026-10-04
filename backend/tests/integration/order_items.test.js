// Righe d'ordine in tabella: isolamento RLS, vincoli ed eliminazione del tenant.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { startServer, createTenant, deleteTenants, closePools, apiClient, adminDb } from './helpers.js';
import { withTenantClient } from '../../middleware/tenantScope.js';
import { toOrderItemRows } from '../../utils/orderItems.js';
import { insertOrderItemRows } from '../../utils/orderItemsWrite.js';

process.env.MASTER_JWT_SECRET ||= 'segreto-master-di-prova-lungo-almeno-32-caratteri';
const masterCookie = { cookie: `master_token=${jwt.sign({ master: true }, process.env.MASTER_JWT_SECRET)}` };

// Come li ha lasciati la storia dell'app: senza line_total, con sconto, con id fuori catalogo, con una riga rotta.
const LEGACY = [
  [{ id: 1, name: 'Panino', price: 5, quantity: 2, note: '' }, { id: 2, name: 'Birra', price: 4, quantity: 1, note: 'fredda', print_destination: 'bar' }],
  [{ id: 3, name: 'Calzone', price: 2.5, quantity: 1, note: '', type: 'discount', discountMode: 'percent', discountValue: 50, original_price: 5, line_total: 2.5, category: 'Calzoni', print_destination: 'kitchen' }],
  [{ id: 'abc', name: 'Prodotto vecchio', price: 3, quantity: 1 }, { id: 4, name: 'Rotto', price: 1, quantity: 0 }, { id: 5, name: 'Combo', price: 1.6666666666666667, quantity: 3, line_total: 5 }],
  [],
];

describe('order_items', () => {
  let server, t1, t2, t3;

  // Ordini di prova; con `withRows` anche le loro righe (altrimenti i test aggiungono le proprie).
  const insertLegacy = async (tenant, { withRows = false } = {}) => {
    const ids = [];
    for (const items of LEGACY) {
      const { rows: [o] } = await adminDb.query(
        `INSERT INTO orders (total, status, tenant_id) VALUES (10, 'completed', $1) RETURNING id`, [tenant.id]);
      if (withRows) await insertOrderItemRows(adminDb, tenant.id, toOrderItemRows(items).rows.map(r => ({ ...r, order_id: o.id })));
      ids.push(o.id);
    }
    return ids;
  };
  const countRows = async (tenant) => (await adminDb.query('SELECT count(*)::int AS n FROM order_items WHERE tenant_id = $1', [tenant.id])).rows[0].n;

  before(async () => {
    server = await startServer();
    [t1, t2, t3] = [await createTenant(), await createTenant(), await createTenant()];
  });
  after(async () => {
    await deleteTenants(t1, t2, t3);
    await server.close();
    await closePools();
  });

  it('RLS: ogni tenant vede e scrive solo le sue righe', async () => {
    const [order1] = await insertLegacy(t1);
    const insert = (tenantId, orderId) => `INSERT INTO order_items (tenant_id, order_id, position, name, quantity, unit_price, line_total) VALUES (${tenantId}, ${orderId}, 0, 'X', 1, 1, 1)`;
    await withTenantClient(t1.id, (db) => db.query(insert(t1.id, order1)));

    assert.equal((await withTenantClient(t1.id, (db) => db.query('SELECT * FROM order_items'))).rows.length, 1);
    assert.equal((await withTenantClient(t2.id, (db) => db.query('SELECT * FROM order_items'))).rows.length, 0);
    // scrivere con il tenant di un altro è vietato dalla policy
    await assert.rejects(withTenantClient(t2.id, (db) => db.query(insert(t1.id, order1))), /row-level security|sicurezza a livello di riga/i);
    // il tenant_id si ricava dal contesto, non dal client
    const { rows } = await withTenantClient(t1.id, (db) => db.query(
      `INSERT INTO order_items (order_id, position, name, quantity, unit_price, line_total) VALUES (${order1}, 1, 'Y', 1, 1, 1) RETURNING tenant_id`));
    assert.equal(rows[0].tenant_id, t1.id);
    await adminDb.query('DELETE FROM order_items WHERE tenant_id = $1', [t1.id]);
    await adminDb.query('DELETE FROM orders WHERE tenant_id = $1', [t1.id]);
  });

  it('vincoli: quantità positiva, posizione unica per ordine, tipo e destinazione ammessi', async () => {
    const [orderId] = await insertLegacy(t1);
    const insert = (overrides = {}) => {
      const row = { order_id: orderId, position: 0, name: 'X', quantity: 1, unit_price: 1, line_total: 1, ...overrides };
      const columns = Object.keys(row);
      return withTenantClient(t1.id, (db) => db.query(
        `INSERT INTO order_items (${columns.join(', ')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})`, Object.values(row)));
    };
    await insert();
    await assert.rejects(insert(), /uniq_order_items_order_position/);
    await assert.rejects(insert({ position: 1, quantity: 0 }), /order_items_quantity_check/);
    await assert.rejects(insert({ position: 1, line_type: 'omaggio' }), /order_items_line_type_check/);
    await assert.rejects(insert({ position: 1, print_destination: 'sala' }), /order_items_print_destination_check/);
    await assert.rejects(insert({ position: -1 }), /order_items_position_check/);
    await adminDb.query('DELETE FROM order_items WHERE tenant_id = $1', [t1.id]);
    await adminDb.query('DELETE FROM orders WHERE tenant_id = $1', [t1.id]);
  });

  it('eliminare un tenant cancella anche le sue righe d\'ordine', async () => {
    await insertLegacy(t3, { withRows: true });
    assert.ok(await countRows(t3) > 0);
    const master = apiClient(server.port, t3.host);
    const res = await master.request('DELETE', `/master/tenants/${t3.id}`, { confirmSlug: t3.slug }, masterCookie);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(await countRows(t3), 0);
  });
});
