// Moduli per tenant: il server applica i moduli accesi, il master li cambia, i tenant esistenti restano com'erano.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { startServer, createTenant, deleteTenants, closePools, apiClient, connectWs, adminDb } from './helpers.js';

process.env.MASTER_JWT_SECRET ||= 'segreto-master-di-prova-lungo-almeno-32-caratteri';
const masterCookie = { cookie: `master_token=${jwt.sign({ master: true }, process.env.MASTER_JWT_SECRET)}` };

describe('moduli per tenant', () => {
  let server, t1, t2, api1, api2, anon1, master;
  const created = [];
  const setModules = (t, modules) => master.request('PUT', `/master/tenants/${t.id}/modules`, { modules }, masterCookie);

  before(async () => {
    server = await startServer();
    [t1, t2] = [await createTenant(), await createTenant()];
    [api1, api2, anon1, master] = [t1, t2, t1, t1].map(t => apiClient(server.port, t.host));
    await api1.login(t1.username);
    await api2.login(t2.username);
  });

  after(async () => {
    await deleteTenants(t1, t2, ...created);
    await server.close();
    await closePools();
  });

  it('un tenant esistente ha i moduli di oggi e tutto risponde come prima', async () => {
    const { rows } = await adminDb.query('SELECT business_type, modules FROM tenants WHERE id = $1', [t1.id]);
    assert.equal(rows[0].business_type, 'sagra');
    assert.deepEqual(rows[0].modules, ['kds', 'stats', 'qr_menu']);

    assert.equal((await api1.get('/stats?tz=Europe/Rome')).status, 200);
    assert.equal((await anon1.get('/products/menu')).status, 200);
    assert.equal((await anon1.get('/orders/kds')).status, 200);
    const me = (await api1.get('/auth/me')).body;
    assert.deepEqual(me.modules, ['kds', 'stats', 'qr_menu']);
    assert.equal(me.businessType, 'sagra');
  });

  it('il login restituisce tipo di attività e moduli', async () => {
    const res = await apiClient(server.port, t1.host).login(t1.username);
    assert.equal(res.body.businessType, 'sagra');
    assert.deepEqual(res.body.modules, ['kds', 'stats', 'qr_menu']);
  });

  it('modulo spento: il server blocca la route con MODULE_DISABLED; il nucleo resta acceso', async () => {
    assert.equal((await setModules(t1, ['qr_menu'])).status, 200);

    const stats = await api1.get('/stats?tz=Europe/Rome');
    assert.equal(stats.status, 403);
    assert.equal(stats.body.code, 'MODULE_DISABLED');
    assert.equal((await api1.get('/stats/shared-products')).body.code, 'MODULE_DISABLED');
    const kds = await anon1.get('/orders/kds');
    assert.equal(kds.status, 403);
    assert.equal(kds.body.code, 'MODULE_DISABLED');
    assert.equal((await anon1.get('/products/menu')).status, 200, 'qr_menu è rimasto acceso');

    // il nucleo non è un modulo
    assert.equal((await api1.get('/products')).status, 200);
    assert.equal((await api1.get('/sessions')).status, 200);
    assert.deepEqual((await api1.get('/auth/me')).body.modules, ['qr_menu']);
  });

  it('il KDS pubblico via WebSocket non si connette se il modulo è spento', async () => {
    const off = await connectWs(server.port, t1.host, { publicKds: true });
    assert.equal(off.httpStatus, 403);
    const on = await connectWs(server.port, t2.host, { publicKds: true });
    assert.equal(on.open, true);
    on.ws.close();
  });

  it('un altro tenant non è toccato; riaccendere il modulo vale subito', async () => {
    assert.equal((await api2.get('/stats?tz=Europe/Rome')).status, 200);
    assert.equal((await setModules(t1, ['kds', 'stats', 'qr_menu'])).status, 200);
    assert.equal((await api1.get('/stats?tz=Europe/Rome')).status, 200);
    assert.equal((await anon1.get('/orders/kds')).status, 200);
  });

  it('tutti i moduli spenti: resta solo il nucleo', async () => {
    assert.equal((await setModules(t1, [])).status, 200);
    assert.equal((await anon1.get('/products/menu')).status, 403);
    assert.equal((await api1.get('/products')).status, 200);
    await setModules(t1, ['kds', 'stats', 'qr_menu']);
  });

  it('il master valida i moduli, e solo il master li cambia', async () => {
    assert.equal((await setModules(t1, ['inesistente'])).status, 400);
    assert.equal((await master.request('PUT', `/master/tenants/${t1.id}/modules`, {}, masterCookie)).status, 400);
    assert.equal((await master.request('PUT', '/master/tenants/999999999/modules', { modules: [] }, masterCookie)).status, 404);
    assert.equal((await master.request('PUT', `/master/tenants/${t1.id}/modules`, { modules: [] })).status, 401);
    // l'admin del tenant non può accendersi i moduli da solo
    assert.equal((await api1.request('PUT', `/master/tenants/${t1.id}/modules`, { modules: ['stats'] })).status, 401);
  });

  it('sagra e ristorante non si mescolano: il tipo è fisso e ogni tipo ha solo i suoi moduli', async () => {
    // una sagra non ha i tavoli
    const noTables = await setModules(t1, ['kds', 'tables']);
    assert.equal(noTables.status, 400);
    assert.match(noTables.body.error, /tables/);
    assert.deepEqual((await adminDb.query('SELECT business_type, modules FROM tenants WHERE id = $1', [t1.id])).rows[0].modules, ['kds', 'stats', 'qr_menu']);
    // il tipo non si cambia: il body con businessType non ha effetto
    await master.request('PUT', `/master/tenants/${t1.id}/modules`, { businessType: 'ristorante', modules: ['kds'] }, masterCookie);
    const { rows } = await adminDb.query('SELECT business_type, modules FROM tenants WHERE id = $1', [t1.id]);
    assert.equal(rows[0].business_type, 'sagra');
    await setModules(t1, ['kds', 'stats', 'qr_menu']);

    // un ristorante non ha il menu QR
    const slug = `mod-${Math.random().toString(36).slice(2, 8)}`;
    const body = { slug, name: `Prova ${slug}`, adminUsername: 'admin', adminPassword: 'temporanea-1', businessType: 'ristorante' };
    const bad = await master.request('POST', '/master/tenants', { ...body, modules: ['tables', 'qr_menu'] }, masterCookie);
    assert.equal(bad.status, 400);
    assert.equal((await master.request('POST', '/master/tenants', { ...body, businessType: 'sagra', modules: ['tables'] }, masterCookie)).status, 400);
    const ok = await master.request('POST', '/master/tenants', body, masterCookie);
    assert.equal(ok.status, 201);
    created.push({ id: ok.body.tenant.id });
    const put = await master.request('PUT', `/master/tenants/${ok.body.tenant.id}/modules`, { modules: ['qr_menu'] }, masterCookie);
    assert.equal(put.status, 400);
  });

  it('creazione tenant: moduli del preset oppure scelti, in ordine di catalogo e senza doppioni', async () => {
    const make = async (extra) => {
      const slug = `mod-${Math.random().toString(36).slice(2, 8)}`;
      const res = await master.request('POST', '/master/tenants', { slug, name: `Prova ${slug}`, adminUsername: 'admin', adminPassword: 'temporanea-1', ...extra }, masterCookie);
      assert.equal(res.status, 201, JSON.stringify(res.body));
      created.push({ id: res.body.tenant.id });
      return res.body.tenant;
    };
    const preset = await make({ businessType: 'ristorante' });
    assert.equal(preset.business_type, 'ristorante');
    assert.deepEqual(preset.modules, ['kds', 'stats', 'tables']);

    const custom = await make({ businessType: 'paninaro', modules: ['qr_menu', 'kds', 'qr_menu'] });
    assert.deepEqual(custom.modules, ['kds', 'qr_menu']);

    const plain = await make({});
    assert.equal(plain.business_type, 'sagra');
    assert.deepEqual(plain.modules, ['kds', 'stats', 'qr_menu']);
  });

  it('catalogo per il pannello master', async () => {
    assert.equal((await master.get('/master/catalog')).status, 401);
    const { body } = await master.request('GET', '/master/catalog', undefined, masterCookie);
    assert.deepEqual(body.modules.map(m => m.id), ['kds', 'stats', 'qr_menu', 'tables']);
    assert.deepEqual(body.businessTypes.map(b => b.id), ['sagra', 'paninaro', 'ristorante']);
    assert.ok(body.businessTypes.every(b => b.label && Array.isArray(b.modules)));
    assert.deepEqual(body.modules.find(m => m.id === 'tables').types, ['ristorante']);
  });
});
