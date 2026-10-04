// Righe d'ordine in tabella (affiancata al JSONB): isolamento RLS, vincoli, riempimento dei vecchi ordini e verifica.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { startServer, createTenant, deleteTenants, closePools, apiClient, adminDb } from './helpers.js';
import { withTenantClient } from '../../middleware/tenantScope.js';
import { scanTenant, verifyTenant } from '../../utils/orderItemsBackfill.js';

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

  const insertLegacy = async (tenant) => {
    const ids = [];
    for (const items of LEGACY) {
      const { rows: [o] } = await adminDb.query(
        `INSERT INTO orders (items, total, status, tenant_id) VALUES ($1, 10, 'completed', $2) RETURNING id`, [JSON.stringify(items), tenant.id]);
      ids.push(o.id);
    }
    return ids;
  };
  // Come lo script con un utente privilegiato: connessione che scavalca la RLS, solo app.tenant_id impostato.
  const asScript = async (tenant, fn) => {
    const client = await adminDb.connect();
    try {
      await client.query('SELECT set_config($1, $2, false)', ['app.tenant_id', String(tenant.id)]);
      return await fn(client);
    } finally { client.release(); }
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

  it('riempimento: la prova non scrive; poi scrive solo il tenant indicato, anche con un utente che scavalca la RLS', async () => {
    await insertLegacy(t1);
    await insertLegacy(t2); // dati di un altro tenant nello stesso database

    const dry = await asScript(t1, (db) => scanTenant(db, t1.id, { apply: false }));
    assert.equal(dry.orders, 4, 'solo gli ordini di t1, non quelli di t2');
    assert.equal(dry.rows, 5);
    assert.equal(dry.skippedRows, 1);
    assert.equal(dry.anomalies.id_non_valido.count, 1);
    assert.equal(dry.anomalies.quantita_non_valida.count, 1);
    assert.equal(await countRows(t1), 0, 'la prova non scrive');

    const applied = await asScript(t1, (db) => scanTenant(db, t1.id, { apply: true }));
    assert.equal(applied.rows, 5);
    assert.equal(await countRows(t1), 5);
    assert.equal(await countRows(t2), 0, 'le righe di t2 non sono state toccate né attribuite a t1');
    const wrong = await adminDb.query(`SELECT count(*)::int AS n FROM order_items i JOIN orders o ON o.id = i.order_id WHERE i.tenant_id <> o.tenant_id`);
    assert.equal(wrong.rows[0].n, 0);
  });

  it('riempimento ripetibile: la seconda volta non aggiunge nulla', async () => {
    const again = await asScript(t1, (db) => scanTenant(db, t1.id, { apply: true }));
    assert.equal(again.ordersToFill, 0);
    assert.equal(again.rows, 0);
    assert.equal(await countRows(t1), 5);
  });

  it('verifica: tutto coincide (la riga con quantità 0 è attesa); un tenant non ancora riempito segnala le righe mancanti', async () => {
    const ok = await asScript(t1, verifyTenant);
    assert.equal(ok.errors, 0, JSON.stringify(ok));
    assert.equal(ok.orders, 4);
    assert.equal(ok.rows, 5);
    assert.equal(ok.counts.attesa_quantita_non_valida, 1);

    const notYet = await asScript(t2, verifyTenant);
    assert.equal(notYet.counts.manca_riga, 5);
    assert.equal(notYet.errors, 5);
  });

  it('verifica: scopre una riga cambiata, una cancellata e una aggiunta a mano', async () => {
    await adminDb.query(`UPDATE order_items SET quantity = 9 WHERE tenant_id = $1 AND name = 'Panino'`, [t1.id]);
    await adminDb.query(`DELETE FROM order_items WHERE tenant_id = $1 AND name = 'Birra'`, [t1.id]);
    const { rows: [any] } = await adminDb.query('SELECT order_id FROM order_items WHERE tenant_id = $1 LIMIT 1', [t1.id]);
    await adminDb.query(`INSERT INTO order_items (tenant_id, order_id, position, name, quantity, unit_price, line_total) VALUES ($1, $2, 50, 'Intruso', 1, 1, 1)`, [t1.id, any.order_id]);

    const r = await asScript(t1, verifyTenant);
    assert.equal(r.counts.valori_diversi, 1);
    assert.equal(r.counts.manca_riga, 1);
    assert.equal(r.counts.riga_in_piu, 1);
    assert.equal(r.errors, 3);

    // si ripara ripetendo da zero: cancello le righe del tenant e riempio
    await adminDb.query('DELETE FROM order_items WHERE tenant_id = $1', [t1.id]);
    await asScript(t1, (db) => scanTenant(db, t1.id, { apply: true }));
    assert.equal((await asScript(t1, verifyTenant)).errors, 0);
  });

  it('eliminare un tenant cancella anche le sue righe d\'ordine', async () => {
    await insertLegacy(t3);
    await asScript(t3, (db) => scanTenant(db, t3.id, { apply: true }));
    assert.ok(await countRows(t3) > 0);
    const master = apiClient(server.port, t3.host);
    const res = await master.request('DELETE', `/master/tenants/${t3.id}`, { confirmSlug: t3.slug }, masterCookie);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(await countRows(t3), 0);
  });
});
