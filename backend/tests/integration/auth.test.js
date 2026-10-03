// Sessione e impostazioni: limiti del rinnovo, tenant disattivato, chiavi pubbliche.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { startServer, createTenant, deleteTenants, closePools, apiClient, signToken, adminDb } from './helpers.js';

const now = () => Math.floor(Date.now() / 1000);
const H = 3600, D = 86400;

describe('sessione e impostazioni', () => {
  let server, t, inactive;

  before(async () => {
    server = await startServer();
    [t, inactive] = await Promise.all([createTenant(), createTenant({ active: false })]);
  });

  after(async () => {
    await deleteTenants(t, inactive);
    await server.close();
    await closePools();
  });

  const refreshWith = (tenant, claims) => {
    const api = apiClient(server.port, tenant.host);
    api.setToken(signToken(tenant, claims));
    return api.post('/auth/refresh');
  };

  it('rinnova un token scaduto da poco e conserva loginAt', async () => {
    const loginAt = now() - 2 * D;
    const api = apiClient(server.port, t.host);
    api.setToken(signToken(t, { iat: now() - 9 * H, exp: now() - H, loginAt }));
    const res = await api.post('/auth/refresh');
    assert.equal(res.status, 200);
    assert.equal(jwt.decode(api.cookie.replace('token=', '')).loginAt, loginAt);
  });

  it('rifiuta un token scaduto da più di 24 ore', async () => {
    const res = await refreshWith(t, { iat: now() - 33 * H, exp: now() - 25 * H, loginAt: now() - 2 * D });
    assert.equal(res.status, 401);
    assert.equal(res.body.code, 'SESSION_EXPIRED');
  });

  it('rifiuta una sessione iniziata più di 7 giorni fa', async () => {
    const res = await refreshWith(t, { exp: now() + H, loginAt: now() - 8 * D });
    assert.equal(res.body.code, 'SESSION_EXPIRED');
  });

  it('rifiuta il rinnovo per un tenant disattivato', async () => {
    const res = await refreshWith(inactive, { exp: now() + H, loginAt: now() });
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'TENANT_INACTIVE');
  });

  it('cambio password con password attuale errata: 400, non 401', async () => {
    const api = apiClient(server.port, t.host);
    await api.login(t.username);
    const res = await api.post('/auth/change-password', { oldPassword: 'sbagliata', newPassword: 'nuovapassword' });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'Password attuale errata');
  });

  it("GET /settings pubblico espone solo le chiavi pubbliche, PUT accetta solo chiavi note", async () => {
    await adminDb.query(`INSERT INTO settings (key, value, tenant_id) VALUES ('chiave_interna', 'segreto', $1)`, [t.id]);
    const api = apiClient(server.port, t.host);
    await api.login(t.username);
    assert.equal((await api.put('/settings/welcome_message', { value: 'Benvenuti' })).status, 200);
    assert.equal((await api.put('/settings/chiave_interna', { value: 'x' })).status, 400);
    const res = await apiClient(server.port, t.host).get('/settings');
    assert.deepEqual(res.body, { welcome_message: 'Benvenuti' });
  });
});
