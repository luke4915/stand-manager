// Contenuto degli scontrini per tenant e ristampa: impostazioni private, audit, isolamento.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'crypto';
import { startServer, createTenant, deleteTenants, closePools, apiClient, adminDb } from './helpers.js';

describe('scontrini: impostazioni e ristampa', () => {
  let server, t1, t2, api1, api2, anon;

  before(async () => {
    server = await startServer();
    [t1, t2] = [await createTenant(), await createTenant()];
    api1 = apiClient(server.port, t1.host);
    api2 = apiClient(server.port, t2.host);
    anon = apiClient(server.port, t1.host);
    await api1.login(t1.username);
    await api2.login(t2.username);
  });

  after(async () => {
    await deleteTenants(t1, t2);
    await server.close();
    await closePools();
  });

  it('le chiavi receipt_* sono lette dalla cassa ma non dall\'endpoint pubblico, e l\'admin non le scrive', async () => {
    await adminDb.query(
      `INSERT INTO settings (key, value, tenant_id) VALUES ('receipt_org_name', 'Pro Loco Prova', $1), ('receipt_legal_text', 'riga 1\nriga 2', $1)`, [t1.id]);

    const all = await api1.get('/settings/all');
    assert.equal(all.body.receipt_org_name, 'Pro Loco Prova');
    assert.equal(all.body.receipt_legal_text, 'riga 1\nriga 2');

    const pub = await anon.get('/settings');
    assert.equal(pub.status, 200);
    assert.ok(!('receipt_org_name' in pub.body));

    assert.deepEqual((await api2.get('/settings/all')).body, {});

    // lo scontrino si personalizza solo dal master
    const write = await api1.request('PUT', '/settings/receipt_org_name', { value: 'Altro nome' });
    assert.equal(write.status, 400);
    assert.equal((await api1.get('/settings/all')).body.receipt_org_name, 'Pro Loco Prova');
    assert.equal((await api1.request('PUT', '/settings/welcome_message', { value: 'Benvenuti' })).status, 200);
  });

  it('/settings/all richiede il login e le chiavi sconosciute sono respinte', async () => {
    assert.equal((await anon.get('/settings/all')).status, 401);
    assert.equal((await api1.request('PUT', '/settings/receipt_inventata', { value: 'x' })).status, 400);
  });

  it('indirizzo stampante con o senza porta', async () => {
    const { rows: [ct] } = await adminDb.query(
      `INSERT INTO copy_types (name, label, tenant_id) VALUES ('Cliente', 'Copia cliente', $1) RETURNING id`, [t1.id]);
    const { rows: [ps] } = await adminDb.query(
      `INSERT INTO print_settings (copy_type_id, tenant_id) VALUES ($1, $2) RETURNING id`, [ct.id, t1.id]);
    for (const printer_address of ['192.168.1.50', '192.168.1.50:443']) {
      const res = await api1.put(`/print-settings/${ps.id}`, { printer_type: 'network', printer_address, enabled: true });
      assert.equal(res.status, 200, printer_address);
    }
  });

  it('la ristampa restituisce l\'ordine e lascia traccia nell\'audit; non vede ordini di altri tenant', async () => {
    const created = await api1.post('/orders', { items: [{ id: t1.productId, name: 'Panino', quantity: 2 }], status: 'completed' });
    assert.equal(created.status, 200);

    const res = await api1.post(`/orders/${created.body.orderId}/reprint`);
    assert.equal(res.status, 200);
    assert.equal(res.body.display_code, created.body.displayCode);
    assert.equal(res.body.total, 10);
    assert.equal(res.body.items[0].name, 'Panino');

    const { rows } = await adminDb.query(
      `SELECT 1 FROM audit_logs WHERE tenant_id = $1 AND action = 'REPRINT_ORDER'`, [t1.id]);
    assert.equal(rows.length, 1);

    assert.equal((await api2.post(`/orders/${created.body.orderId}/reprint`)).status, 404);
  });

  it('le ristampe offline si registrano in differita nell\'audit; ordine non ancora sincronizzato: 404', async () => {
    const key = randomUUID();
    const body = { client_order_id: key, reprinted_at: ['2026-10-03T20:00:00.000Z', '2026-10-03T20:05:00.000Z'] };
    const early = await api1.post('/orders/reprints', body);
    assert.equal(early.status, 404);
    assert.equal(early.body.code, 'ORDER_NOT_SYNCED');

    await api1.post('/orders', { items: [{ id: t1.productId, name: 'Panino', quantity: 1 }], status: 'completed', client_order_id: key });
    assert.equal((await api1.post('/orders/reprints', body)).status, 200);
    const { rows } = await adminDb.query(
      `SELECT details FROM audit_logs WHERE tenant_id = $1 AND action = 'REPRINT_ORDER' AND details->>'offline' = 'true'`, [t1.id]);
    assert.equal(rows.length, 2);

    assert.equal((await api2.post('/orders/reprints', body)).status, 404); // un altro tenant non vede l'ordine
    assert.equal((await api1.post('/orders/reprints', { client_order_id: key, reprinted_at: [] })).status, 400);
  });

  it('il nome di una copia è unico per tenant: due tenant possono avere la stessa copia, lo stesso tenant no', async () => {
    const body = { name: 'Ritiro Bar', label: 'Copia bar' };
    const first = await api1.post('/print-settings/copy-types', body);
    const other = await api2.post('/print-settings/copy-types', body);
    assert.equal(first.status, 201);
    assert.equal(other.status, 201, 'un altro tenant deve poter creare la stessa copia');
    const again = await api1.post('/print-settings/copy-types', body);
    assert.equal(again.status, 409);
    assert.equal(again.body.error, 'Nome già esistente');
  });
});
