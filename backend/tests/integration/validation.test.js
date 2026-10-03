// Validazione degli input (zod) e permessi sulle route che validavano a mano.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import { startServer, createTenant, deleteTenants, closePools, apiClient, adminDb, PASSWORD } from './helpers.js';

describe('validazione e permessi', () => {
  let server, t, admin, kitchen;

  before(async () => {
    server = await startServer();
    t = await createTenant();
    await adminDb.query(
      `INSERT INTO users (username, password_hash, role, tenant_id) VALUES ($1, $2, 'cucina', $3)`,
      [`cucina-${t.slug}`, await bcrypt.hash(PASSWORD, 4), t.id]);
    admin = apiClient(server.port, t.host);
    kitchen = apiClient(server.port, t.host);
    await admin.login(t.username);
    await kitchen.login(`cucina-${t.slug}`);
  });

  after(async () => {
    await deleteTenants(t);
    await server.close();
    await closePools();
  });

  it('prodotto non valido: 400 con il campo e il motivo in italiano', async () => {
    const res = await admin.post('/products', { name: '', price: 5, category: 'Cibo' });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /^name: /);
  });

  it('prodotto valido: i campi extra inviati dal frontend vengono ignorati', async () => {
    const res = await admin.post('/products', { name: 'Birra', price: '4.5', category: 'Bevande', tenant_id: 999, id: 1 });
    assert.equal(res.status, 201);
    assert.equal(res.body.tenant_id, t.id);
    assert.equal(Number(res.body.price), 4.5);
  });

  it('stock: la cucina non può modificarlo, la cassa sì ma con una quantità valida', async () => {
    const path = `/products/${t.productId}/stock`;
    assert.equal((await kitchen.request('PATCH', path, { stock_enabled: true, stock: 5 })).status, 403);
    assert.equal((await admin.request('PATCH', path, { stock_enabled: true, stock: null })).status, 400);
    assert.equal((await admin.request('PATCH', path, { stock_enabled: true, stock: -1 })).status, 400);
    const ok = await admin.request('PATCH', path, { stock_enabled: false, stock: 7 });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.stock, null);
  });

  it('id non numerico nel percorso: 400', async () => {
    assert.equal((await admin.put('/orders/abc', { status: 'completed' })).status, 400);
    assert.equal((await admin.request('DELETE', '/products/abc')).status, 400);
  });

  it('impostazione di stampa con indirizzo di rete non valido: 400', async () => {
    const res = await admin.put('/print-settings/1', { printer_type: 'network', printer_address: 'stampante', enabled: true });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /printer_address/);
  });
});
