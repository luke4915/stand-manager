// Gestione utenti: admin del tenant e pannello master, con le protezioni (ultimo admin, se stessi) e l'isolamento tra tenant.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { startServer, createTenant, deleteTenants, closePools, apiClient, adminDb, PASSWORD } from './helpers.js';

process.env.MASTER_JWT_SECRET ||= 'segreto-master-di-prova-lungo-almeno-32-caratteri';
const masterCookie = { cookie: `master_token=${jwt.sign({ master: true }, process.env.MASTER_JWT_SECRET)}` };

describe('gestione utenti', () => {
  let server, t1, t2, api1, api2, master;
  const m = (method, path, body) => master.request(method, `/master/tenants${path}`, body, masterCookie);

  before(async () => {
    server = await startServer();
    [t1, t2] = [await createTenant(), await createTenant()];
    api1 = apiClient(server.port, t1.host);
    api2 = apiClient(server.port, t2.host);
    master = apiClient(server.port, t1.host);
    await api1.login(t1.username);
    await api2.login(t2.username);
  });

  after(async () => {
    await deleteTenants(t1, t2);
    await server.close();
    await closePools();
  });

  it('l\'admin vede solo gli utenti del suo tenant, senza hash', async () => {
    const res = await api1.get('/auth/admin/users');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.map(u => u.username), [t1.username]);
    assert.equal(res.body[0].password_hash, undefined);
    assert.equal(res.body[0].has_password, true);
  });

  it('chi non è admin non gestisce gli utenti', async () => {
    const created = await api1.post('/auth/admin/createUser', { username: 'cassiera', role: 'cassa', password: 'temporanea1' });
    assert.equal(created.status, 201);
    const cassa = apiClient(server.port, t1.host);
    await cassa.login('cassiera', 'temporanea1');
    assert.equal((await cassa.get('/auth/admin/users')).status, 403);
    assert.equal((await cassa.request('DELETE', `/auth/admin/users/${t1.userId}`)).status, 403);
  });

  it('cambio ruolo e username; username duplicato: 409; il ruolo nuovo vale subito', async () => {
    const { body: [, cassiera] } = await api1.get('/auth/admin/users');
    const id = (await api1.get('/auth/admin/users')).body.find(u => u.username === 'cassiera').id;
    assert.ok(cassiera);

    const res = await api1.request('PATCH', `/auth/admin/users/${id}`, { role: 'cucina', username: 'cuoca' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.role, 'cucina');
    assert.equal(res.body.username, 'cuoca');

    const dup = await api1.request('PATCH', `/auth/admin/users/${id}`, { username: t1.username });
    assert.equal(dup.status, 409);
    assert.equal((await api1.request('PATCH', `/auth/admin/users/${id}`, {})).status, 400);
    assert.equal((await api1.request('PATCH', `/auth/admin/users/${id}`, { role: 'superuser' })).status, 400);
  });

  it('un admin non si elimina né declassa da solo; l\'ultimo admin non si tocca', async () => {
    const self = await api1.request('DELETE', `/auth/admin/users/${t1.userId}`);
    assert.equal(self.status, 409);
    assert.equal(self.body.code, 'SELF_DELETE');
    const role = await api1.request('PATCH', `/auth/admin/users/${t1.userId}`, { role: 'cassa' });
    assert.equal(role.body.code, 'SELF_ROLE_CHANGE');

    // il master prova a declassare/eliminare l'unico admin
    const lastRole = await m('PATCH', `/${t1.id}/users/${t1.userId}`, { role: 'cassa' });
    assert.equal(lastRole.status, 409);
    assert.equal(lastRole.body.code, 'LAST_ADMIN');
    const lastDel = await m('DELETE', `/${t1.id}/users/${t1.userId}`);
    assert.equal(lastDel.body.code, 'LAST_ADMIN');
  });

  it('un utente eliminato perde subito l\'accesso e il suo audit resta', async () => {
    const created = await api1.post('/auth/admin/createUser', { username: 'temp', role: 'cassa', password: 'temporanea1' });
    const id = created.body.user.id;
    const temp = apiClient(server.port, t1.host);
    await temp.login('temp', 'temporanea1');
    assert.equal((await temp.get('/auth/me')).status, 200);

    assert.equal((await api1.request('DELETE', `/auth/admin/users/${id}`)).status, 200);
    const me = await temp.get('/auth/me');
    assert.equal(me.status, 401);
    assert.equal(me.body.code, 'USER_REVOKED');
    assert.equal((await api1.request('DELETE', `/auth/admin/users/${id}`)).status, 404);

    const { rows } = await adminDb.query(`SELECT action FROM audit_logs WHERE tenant_id = $1 AND action = 'DELETE_USER'`, [t1.id]);
    assert.equal(rows.length, 1);
  });

  it('un admin non tocca gli utenti di un altro tenant', async () => {
    assert.equal((await api2.request('PATCH', `/auth/admin/users/${t1.userId}`, { role: 'cucina' })).status, 404);
    assert.equal((await api2.request('DELETE', `/auth/admin/users/${t1.userId}`)).status, 404);
    assert.equal((await api2.post(`/auth/admin/users/${t1.userId}/reset-password`, { password: 'nuovapass1' })).status, 404);
  });

  it('reset password: temporanea, da cambiare al primo accesso', async () => {
    const id = (await api1.get('/auth/admin/users')).body.find(u => u.username === 'cuoca').id;
    assert.equal((await api1.post(`/auth/admin/users/${id}/reset-password`, { password: 'corta' })).status, 400);
    assert.equal((await api1.post(`/auth/admin/users/${id}/reset-password`, { password: 'nuovapass1' })).status, 200);
    const u = apiClient(server.port, t1.host);
    assert.equal((await u.login('cuoca', 'nuovapass1')).status, 200);
    const list = (await api1.get('/auth/admin/users')).body.find(x => x.id === id);
    assert.equal(list.must_change_password, true);
  });

  it('password temporanea: dall\'admin al primo accesso, passo per passo', async () => {
    // 1. l'admin crea l'utente scegliendo la password temporanea
    const created = await api1.post('/auth/admin/createUser', { username: 'nuovo', role: 'cassa', password: 'Temp-Pass-1' });
    assert.equal(created.status, 201);
    const { rows: [row] } = await adminDb.query('SELECT password_hash, must_change_password FROM users WHERE id = $1', [created.body.user.id]);
    assert.equal(row.must_change_password, true);
    assert.match(row.password_hash, /^\$2[aby]\$12\$/, 'bcrypt costo 12, mai in chiaro');
    assert.ok(!row.password_hash.includes('Temp-Pass-1'));

    // 2. entra con la temporanea ma può fare solo il cambio password
    const user = apiClient(server.port, t1.host);
    const login = await user.login('nuovo', 'Temp-Pass-1');
    assert.equal(login.body.needsPassword, true);
    assert.equal((await user.get('/products')).body.code, 'PASSWORD_CHANGE_REQUIRED');

    // 3. sceglie la sua e da quel momento lavora, subito (nessuna attesa della cache)
    assert.equal((await user.post('/auth/change-password', { oldPassword: 'Temp-Pass-1', newPassword: 'Scelta-Da-Me-9' })).status, 200);
    assert.equal((await user.get('/products')).status, 200);
    assert.equal((await apiClient(server.port, t1.host).login('nuovo', 'Temp-Pass-1')).status, 401, 'la temporanea non vale più');
  });

  it('reset password su un utente già collegato: alla richiesta successiva deve cambiarla', async () => {
    const id = (await api1.post('/auth/admin/createUser', { username: 'collegato', role: 'cassa', password: 'Prima-Pass-1' })).body.user.id;
    const user = apiClient(server.port, t1.host);
    await user.login('collegato', 'Prima-Pass-1');
    await user.post('/auth/change-password', { oldPassword: 'Prima-Pass-1', newPassword: 'Mia-Pass-123' });
    assert.equal((await user.get('/products')).status, 200);

    // l'admin reimposta mentre l'utente ha ancora una sessione valida
    assert.equal((await api1.post(`/auth/admin/users/${id}/reset-password`, { password: 'Reset-Pass-1' })).status, 200);
    const blocked = await user.get('/products');
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.code, 'PASSWORD_CHANGE_REQUIRED');
    assert.equal((await user.get('/auth/me')).body.needsPassword, true);

    assert.equal((await user.post('/auth/change-password', { oldPassword: 'Reset-Pass-1', newPassword: 'Ancora-Mia-1' })).status, 200);
    assert.equal((await user.get('/products')).status, 200);
  });

  it('profilo: il cambio username aggiorna anche la sessione e si registra', async () => {
    await api1.post('/auth/admin/createUser', { username: 'vecchio', role: 'cassa', password: 'Temp-Pass-1' });
    const user = apiClient(server.port, t1.host);
    await user.login('vecchio', 'Temp-Pass-1');
    await user.post('/auth/change-password', { oldPassword: 'Temp-Pass-1', newPassword: 'Mia-Pass-123' });

    const res = await user.request('PATCH', '/profile/username', { newUsername: 'rinominato' });
    assert.equal(res.status, 200);
    assert.equal((await user.get('/auth/me')).body.username, 'rinominato');
    assert.equal((await user.request('PATCH', '/profile/username', { newUsername: t1.username })).status, 409);
    assert.equal((await apiClient(server.port, t1.host).login('rinominato', 'Mia-Pass-123')).status, 200);
    const { rows } = await adminDb.query(`SELECT 1 FROM audit_logs WHERE tenant_id = $1 AND action = 'CHANGE_USERNAME'`, [t1.id]);
    assert.equal(rows.length, 1);
  });

  it('due admin che si declassano a vicenda insieme: niente deadlock, ne resta almeno uno', async () => {
    const created = await api1.post('/auth/admin/createUser', { username: 'admin2', role: 'admin', password: 'Temp-Pass-1' });
    const b = apiClient(server.port, t1.host);
    await b.login('admin2', 'Temp-Pass-1');
    await b.post('/auth/change-password', { oldPassword: 'Temp-Pass-1', newPassword: 'Mia-Pass-123' });

    for (let round = 0; round < 5; round++) {
      const [r1, r2] = await Promise.all([
        api1.request('PATCH', `/auth/admin/users/${created.body.user.id}`, { role: 'cassa' }),
        b.request('PATCH', `/auth/admin/users/${t1.userId}`, { role: 'cassa' }),
      ]);
      assert.ok([200, 401, 403, 409].includes(r1.status) && [200, 401, 403, 409].includes(r2.status), `${r1.status}/${r2.status}`);
      const { rows } = await adminDb.query(`SELECT count(*)::int AS n FROM users WHERE tenant_id = $1 AND role = 'admin'`, [t1.id]);
      assert.ok(rows[0].n >= 1);
      await adminDb.query(`UPDATE users SET role = 'admin' WHERE tenant_id = $1 AND id IN ($2, $3)`, [t1.id, t1.userId, created.body.user.id]);
    }
    await api1.request('DELETE', `/auth/admin/users/${created.body.user.id}`);
  });

  it('un admin può rinominarsi (token aggiornato) e rimandare il proprio ruolo senza errore', async () => {
    const own = await api1.request('PATCH', `/auth/admin/users/${t1.userId}`, { username: `${t1.username}-b`, role: 'admin' });
    assert.equal(own.status, 200, JSON.stringify(own.body));
    assert.equal((await api1.get('/auth/me')).body.username, `${t1.username}-b`);
    await api1.request('PATCH', `/auth/admin/users/${t1.userId}`, { username: t1.username });
  });

  it('un token con l\'obbligo di cambiare password non blocca più se il database dice di no', async () => {
    const stale = apiClient(server.port, t1.host);
    stale.setToken((await import('./helpers.js')).signToken(t1, { mustChangePassword: true }));
    assert.equal((await stale.get('/products')).status, 200);
  });

  it('master: senza sessione master niente; vede e gestisce gli utenti del tenant', async () => {
    assert.equal((await master.get(`/master/tenants/${t1.id}/users`)).status, 401);
    assert.equal((await api1.get(`/master/tenants/${t1.id}/users`)).status, 401);

    const list = await m('GET', `/${t1.id}/users`);
    assert.equal(list.status, 200);
    assert.ok(list.body.some(u => u.username === t1.username));
    assert.ok(!list.body.some(u => u.username === t2.username), 'utenti di un altro tenant');
    assert.equal(list.body[0].password_hash, undefined);

    const created = await m('POST', `/${t1.id}/users`, { username: 'dalmaster', role: 'responsabile', password: 'temporanea1' });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal((await m('POST', `/${t1.id}/users`, { username: 'dalmaster', role: 'cassa', password: 'temporanea1' })).status, 409);
    const { rows } = await adminDb.query('SELECT tenant_id FROM users WHERE id = $1', [created.body.id]);
    assert.equal(rows[0].tenant_id, t1.id);

    const id = created.body.id;
    assert.equal((await m('PATCH', `/${t1.id}/users/${id}`, { role: 'cassa' })).body.role, 'cassa');
    assert.equal((await m('POST', `/${t1.id}/users/${id}/reset-password`, { password: 'altrapass12' })).status, 200);
    assert.equal((await apiClient(server.port, t1.host).login('dalmaster', 'altrapass12')).status, 200);

    // un utente di t1 non si raggiunge passando da t2
    assert.equal((await m('PATCH', `/${t2.id}/users/${id}`, { role: 'cucina' })).status, 404);
    assert.equal((await m('DELETE', `/${t2.id}/users/${id}`)).status, 404);

    assert.equal((await m('DELETE', `/${t1.id}/users/${id}`)).status, 200);
    assert.equal((await m('GET', '/999999999/users')).status, 404);

    const audit = await adminDb.query(`SELECT action, user_id FROM audit_logs WHERE tenant_id = $1 AND action LIKE 'MASTER_%'`, [t1.id]);
    assert.ok(audit.rows.length >= 4);
    assert.ok(audit.rows.every(r => r.user_id === null));
  });
});
