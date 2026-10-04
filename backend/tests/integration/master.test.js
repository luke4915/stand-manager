// Pannello master: personalizzazione degli scontrini per tenant ed eliminazione completa di un tenant.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { startServer, createTenant, deleteTenants, closePools, apiClient, adminDb } from './helpers.js';

process.env.MASTER_JWT_SECRET ||= 'segreto-master-di-prova-lungo-almeno-32-caratteri';
const masterCookie = { cookie: `master_token=${jwt.sign({ master: true }, process.env.MASTER_JWT_SECRET)}` };

// PNG minimo valido (1x1) in data URL
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('pannello master', () => {
  let server, t1, t2, master, api1, api2;
  const mput = (t, body) => master.request('PUT', `/master/tenants/${t.id}/receipt`, body, masterCookie);
  const mget = (t) => master.request('GET', `/master/tenants/${t.id}/receipt`, undefined, masterCookie);

  before(async () => {
    server = await startServer();
    [t1, t2] = [await createTenant(), await createTenant()];
    master = apiClient(server.port, t1.host);
    api1 = apiClient(server.port, t1.host);
    api2 = apiClient(server.port, t2.host);
    await api1.login(t1.username);
    await api2.login(t2.username);
  });

  after(async () => {
    await deleteTenants(t1, t2);
    await server.close();
    await closePools();
  });

  it('senza sessione master la personalizzazione non si legge né si scrive', async () => {
    assert.equal((await master.get(`/master/tenants/${t1.id}/receipt`)).status, 401);
    assert.equal((await master.request('PUT', `/master/tenants/${t1.id}/receipt`, {})).status, 401);
    // il token di un tenant non vale come sessione master
    assert.equal((await api1.get(`/master/tenants/${t1.id}/receipt`)).status, 401);
  });

  it('testi e immagini si salvano per tenant e la cassa li legge; i campi vuoti tornano al predefinito', async () => {
    const res = await mput(t1, { receipt_org_name: '  Pro Loco Prova ', receipt_total_label: 'TOTALE OFFERTA', receipt_logo: PNG, receipt_side_image: PNG, receipt_title: '' });
    assert.equal(res.status, 200);

    assert.deepEqual(Object.keys((await mget(t1)).body).sort(), ['receipt_logo', 'receipt_org_name', 'receipt_side_image', 'receipt_total_label']);
    const seenByCassa = (await api1.get('/settings/all')).body;
    assert.equal(seenByCassa.receipt_org_name, 'Pro Loco Prova');
    assert.equal(seenByCassa.receipt_logo, PNG);

    // un altro tenant non vede nulla
    assert.deepEqual((await mget(t2)).body, {});
    assert.deepEqual((await api2.get('/settings/all')).body, {});

    // il salvataggio sostituisce l'insieme: ciò che manca viene tolto
    await mput(t1, { receipt_org_name: 'Nuovo nome' });
    assert.deepEqual((await mget(t1)).body, { receipt_org_name: 'Nuovo nome' });
  });

  it('valida immagini e lunghezze; tenant inesistente: 404', async () => {
    assert.equal((await mput(t1, { receipt_logo: 'http://esempio.it/logo.png' })).status, 400);
    assert.equal((await mput(t1, { receipt_logo: 'data:image/svg+xml;base64,AAAA' })).status, 400);
    assert.equal((await mput(t1, { receipt_logo: `data:image/png;base64,${'A'.repeat(150_001)}` })).status, 400);
    assert.equal((await mput(t1, { receipt_item_header: 'x'.repeat(31) })).status, 400);
    assert.equal((await master.request('GET', '/master/tenants/999999999/receipt', undefined, masterCookie)).status, 404);
  });

  it('eliminare un tenant con dispositivi, ordini e personalizzazione cancella tutto', async () => {
    const doomed = await createTenant();
    const api = apiClient(server.port, doomed.host);
    await api.login(doomed.username);
    const device = (await api.post('/devices')).body;
    const order = await api.post('/orders', { items: [{ id: doomed.productId, name: 'Panino', quantity: 1 }], status: 'completed', device_id: device.id, device_seq: 1 });
    assert.equal(order.status, 200);
    await master.request('PUT', `/master/tenants/${doomed.id}/receipt`, { receipt_org_name: 'Da eliminare' }, masterCookie);

    const res = await master.request('DELETE', `/master/tenants/${doomed.id}`, { confirmSlug: doomed.slug }, masterCookie);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    for (const table of ['devices', 'orders', 'settings', 'users']) {
      const { rows } = await adminDb.query(`SELECT 1 FROM ${table} WHERE tenant_id = $1`, [doomed.id]);
      assert.equal(rows.length, 0, table);
    }
    assert.equal((await adminDb.query('SELECT 1 FROM tenants WHERE id = $1', [doomed.id])).rows.length, 0);
  });
});
