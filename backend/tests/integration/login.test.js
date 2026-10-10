// Login per tenant: lo stesso username in tenant diversi, nessuna deroga di lettura sulla tabella users.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { startServer, createTenant, deleteTenants, closePools, apiClient, adminDb } from './helpers.js';

process.env.MASTER_JWT_SECRET ||= 'segreto-master-di-prova-lungo-almeno-32-caratteri';
const masterCookie = { cookie: `master_token=${jwt.sign({ master: true }, process.env.MASTER_JWT_SECRET)}` };

describe('login per tenant', () => {
  let server, t1, t2, api1, api2;
  const created = []; // tenant creati dal master nel test, da eliminare alla fine

  before(async () => {
    server = await startServer();
    [t1, t2] = [await createTenant(), await createTenant()];
    api1 = apiClient(server.port, t1.host);
    api2 = apiClient(server.port, t2.host);
    // stesso username in entrambi i tenant, password diverse
    await adminDb.query('DELETE FROM users WHERE tenant_id = ANY($1)', [[t1.id, t2.id]]);
    for (const [t, password] of [[t1, 'password-uno'], [t2, 'password-due']]) {
      await adminDb.query(`INSERT INTO users (username, password_hash, role, tenant_id) VALUES ('admin', $1, 'admin', $2)`, [await bcrypt.hash(password, 4), t.id]);
    }
  });

  after(async () => {
    const master = apiClient(server.port, t1.host);
    for (const slug of created) {
      const { rows: [row] } = await adminDb.query('SELECT id FROM tenants WHERE slug = $1', [slug]);
      if (row) await master.request('DELETE', `/master/tenants/${row.id}`, { confirmSlug: slug }, masterCookie);
    }
    await deleteTenants(t1, t2);
    await server.close();
    await closePools();
  });

  it('lo stesso username in due tenant: ognuno entra dal proprio sottodominio con la propria password', async () => {
    const one = await api1.login('admin', 'password-uno');
    const two = await api2.login('admin', 'password-due');
    assert.equal(one.status, 200);
    assert.equal(two.status, 200);
    assert.notEqual(one.body.id, two.body.id);
    assert.equal(jwt.decode(api1.cookie.replace('token=', '')).tenantId, t1.id);
    assert.equal(jwt.decode(api2.cookie.replace('token=', '')).tenantId, t2.id);
  });

  it('la password di un tenant non vale sull\'altro e l\'utente altrui non si distingue da uno inesistente', async () => {
    const wrong = await apiClient(server.port, t1.host).login('admin', 'password-due');
    assert.equal(wrong.status, 401);
    assert.equal((await apiClient(server.port, t2.host).login('admin', 'password-uno')).status, 401);
    const other = await apiClient(server.port, t1.host).login(`inesistente-${t1.slug}`);
    assert.equal(other.status, 401);
    // Utente inesistente e password errata danno la stessa risposta: non si scopre quali username esistono
    assert.equal(other.body.error, 'Credenziali non valide');
    assert.deepEqual(other.body, wrong.body);
  });

  it('creare e rinominare utenti: duplicati solo nello stesso tenant', async () => {
    const admin = apiClient(server.port, t1.host);
    await admin.login('admin', 'password-uno');
    const other = apiClient(server.port, t2.host);
    await other.login('admin', 'password-due');

    assert.equal((await admin.post('/auth/admin/createUser', { username: 'cassa1', role: 'cassa', password: 'temporanea-1' })).status, 201);
    assert.equal((await other.post('/auth/admin/createUser', { username: 'cassa1', role: 'cassa', password: 'temporanea-1' })).status, 201); // stesso nome, altro tenant
    const dup = await admin.post('/auth/admin/createUser', { username: 'cassa1', role: 'cassa', password: 'temporanea-1' });
    assert.equal(dup.status, 409);
    assert.equal(dup.body.error, 'Username già esistente');

    assert.equal((await admin.request('PATCH', '/profile/username', { newUsername: 'cassa1' })).status, 409);
    assert.equal((await admin.request('PATCH', '/profile/username', { newUsername: 'responsabile' })).status, 200);
  });

  it('la tabella users non ha più deroghe: senza tenant impostato non si legge nessun utente', async () => {
    const { pool } = await import('../../db.js');
    const client = await pool.connect();
    try {
      // la vecchia deroga per il login non ha più effetto
      await client.query("SELECT set_config('app.allow_login_lookup', 'true', false)");
      assert.equal((await client.query('SELECT count(*)::int AS n FROM users')).rows[0].n, 0);
      await client.query("SELECT set_config('app.tenant_id', $1, false)", [String(t1.id)]);
      assert.ok((await client.query('SELECT count(*)::int AS n FROM users')).rows[0].n > 0);
      assert.equal((await client.query('SELECT count(*)::int AS n FROM users WHERE tenant_id = $1', [t2.id])).rows[0].n, 0);
    } finally {
      await client.query('RESET app.allow_login_lookup');
      await client.query('RESET app.tenant_id');
      client.release();
    }
  });

  it('il master crea due tenant con lo stesso username admin; lo slug resta unico', async () => {
    const master = apiClient(server.port, t1.host);
    const slug = (n) => `prova-${t1.slug}-${n}`;
    for (const n of ['a', 'b']) {
      const res = await master.request('POST', '/master/tenants', { slug: slug(n), name: `Prova ${n}`, adminUsername: 'admin', adminPassword: 'temporanea-1' }, masterCookie);
      assert.equal(res.status, 201, JSON.stringify(res.body));
      created.push(slug(n));
    }
    const dup = await master.request('POST', '/master/tenants', { slug: slug('a'), name: 'Doppione', adminUsername: 'admin', adminPassword: 'temporanea-1' }, masterCookie);
    assert.equal(dup.status, 409);
    assert.equal(dup.body.error, 'Slug già esistente');
  });

  it('un utente senza password non entra, con nessuna password', async () => {
    await adminDb.query(`INSERT INTO users (username, role, tenant_id) VALUES ('senzapassword', 'cassa', $1)`, [t1.id]);
    for (const password of ['x', 'password-uno', ' ']) {
      const res = await apiClient(server.port, t1.host).login('senzapassword', password);
      assert.equal(res.status, 401, `password "${password}"`);
    }
    assert.equal((await apiClient(server.port, t1.host).request('POST', '/auth/login', { username: 'senzapassword' })).status, 400);
  });

  it('password temporanea: il server blocca tutto finché non viene cambiata', async () => {
    const admin = apiClient(server.port, t1.host);
    await admin.login('responsabile', 'password-uno'); // rinominato dal test precedente
    assert.equal((await admin.post('/auth/admin/createUser', { username: 'nuovo', role: 'cassa', password: 'temporanea-1' })).status, 201);

    const user = apiClient(server.port, t1.host);
    const login = await user.login('nuovo', 'temporanea-1');
    assert.equal(login.status, 200);
    assert.equal(login.body.needsPassword, true);

    const blocked = await user.get('/products');
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.code, 'PASSWORD_CHANGE_REQUIRED');
    assert.equal((await user.get('/auth/me')).body.needsPassword, true);

    // la password attuale serve sempre, e la nuova deve essere diversa
    assert.equal((await user.post('/auth/change-password', { oldPassword: 'sbagliata', newPassword: 'nuova-password' })).status, 400);
    assert.equal((await user.post('/auth/change-password', { oldPassword: 'temporanea-1', newPassword: 'temporanea-1' })).status, 400);
    assert.equal((await user.post('/auth/change-password', { oldPassword: 'temporanea-1', newPassword: 'nuova-password' })).status, 200);

    assert.equal((await user.get('/products')).status, 200);
    assert.equal((await user.get('/auth/me')).body.needsPassword, false);
    const again = await apiClient(server.port, t1.host).login('nuovo', 'nuova-password');
    assert.equal(again.body.needsPassword, false);
  });

  it('reimpostazione della password: solo admin, solo nel proprio tenant, da cambiare al primo accesso', async () => {
    const admin = apiClient(server.port, t1.host);
    await admin.login('responsabile', 'password-uno'); // rinominato dal test precedente
    const { rows: [target] } = await adminDb.query(`SELECT id FROM users WHERE tenant_id = $1 AND username = 'senzapassword'`, [t1.id]);
    const { rows: [foreign] } = await adminDb.query(`SELECT id FROM users WHERE tenant_id = $1 AND username = 'admin'`, [t2.id]);

    assert.equal((await admin.post(`/auth/admin/users/${foreign.id}/reset-password`, { password: 'altro-tenant' })).status, 404);
    assert.equal((await admin.post(`/auth/admin/users/${target.id}/reset-password`, { password: 'corta' })).status, 400);
    assert.equal((await admin.post(`/auth/admin/users/${target.id}/reset-password`, { password: 'sbloccata-1' })).status, 200);

    const login = await apiClient(server.port, t1.host).login('senzapassword', 'sbloccata-1');
    assert.equal(login.status, 200);
    assert.equal(login.body.needsPassword, true);

    const { rows: [other] } = await adminDb.query(`SELECT password_hash FROM users WHERE id = $1`, [foreign.id]);
    assert.ok(await bcrypt.compare('password-due', other.password_hash)); // l'altro tenant non è stato toccato
  });
});
