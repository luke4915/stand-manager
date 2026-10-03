// Contenuto degli scontrini per tenant e ristampa: impostazioni private, audit, isolamento.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
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

  it('le chiavi receipt_* si salvano per tenant e non escono dall\'endpoint pubblico', async () => {
    assert.equal((await api1.request('PUT', '/settings/receipt_org_name', { value: 'Pro Loco Prova' })).status, 200);
    assert.equal((await api1.request('PUT', '/settings/receipt_legal_text', { value: 'riga 1\nriga 2' })).status, 200);

    const all = await api1.get('/settings/all');
    assert.equal(all.body.receipt_org_name, 'Pro Loco Prova');
    assert.equal(all.body.receipt_legal_text, 'riga 1\nriga 2');

    const pub = await anon.get('/settings');
    assert.equal(pub.status, 200);
    assert.ok(!('receipt_org_name' in pub.body));

    assert.deepEqual((await api2.get('/settings/all')).body, {});
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
});
