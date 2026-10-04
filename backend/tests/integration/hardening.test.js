// Rinforzi di sicurezza: utenti revocati, token con algoritmo diverso, dati d'ordine dal catalogo,
// ordini in ritardo, vincoli del database, file pubblici.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { startServer, createTenant, deleteTenants, closePools, apiClient, adminDb, PASSWORD } from './helpers.js';
import { clearUserStatusCache } from '../../utils/userStatus.js';

describe('rinforzi di sicurezza', () => {
  let server, t, admin;

  before(async () => {
    server = await startServer();
    t = await createTenant();
    admin = apiClient(server.port, t.host);
    await admin.login(t.username);
  });

  after(async () => {
    await deleteTenants(t);
    await server.close();
    await closePools();
  });

  const addUser = async (username, role) => {
    const { rows: [u] } = await adminDb.query(
      `INSERT INTO users (username, password_hash, role, tenant_id) VALUES ($1, $2, $3, $4) RETURNING id`,
      [username, await bcrypt.hash(PASSWORD, 4), role, t.id]);
    return u.id;
  };

  it('un utente eliminato o cambiato di ruolo smette di valere subito, non alla scadenza del token', async () => {
    const id = await addUser(`temp-${t.slug}`, 'cassa');
    const user = apiClient(server.port, t.host);
    await user.login(`temp-${t.slug}`);
    assert.equal((await user.get('/products')).status, 200);
    assert.equal((await user.post('/orders', { items: [{ id: t.productId, name: 'x', quantity: 1 }] })).status, 200);

    await adminDb.query(`UPDATE users SET role = 'cucina' WHERE id = $1`, [id]);
    clearUserStatusCache();
    assert.equal((await user.post('/orders', { items: [{ id: t.productId, name: 'x', quantity: 1 }] })).status, 403);

    await adminDb.query('DELETE FROM users WHERE id = $1', [id]);
    clearUserStatusCache();
    const res = await user.get('/products');
    assert.equal(res.status, 401);
    assert.equal(res.body.code, 'USER_REVOKED');
  });

  it('un token firmato con un altro algoritmo non vale', async () => {
    const api = apiClient(server.port, t.host);
    api.setToken(jwt.sign({ id: t.userId, role: 'admin', tenantId: t.id }, process.env.JWT_SECRET, { algorithm: 'HS512' }));
    assert.equal((await api.get('/products')).status, 403);
    api.setToken(jwt.sign({ id: t.userId, role: 'admin', tenantId: t.id }, '', { algorithm: 'none' }));
    assert.equal((await api.get('/products')).status, 403);
  });

  it('il cookie di sessione è SameSite=Lax', async () => {
    const res = await apiClient(server.port, t.host).login(t.username);
    assert.match(String(res.headers['set-cookie']), /SameSite=Lax/i);
  });

  it('nome, categoria e destinazione di stampa delle righe vengono dal catalogo, non dal client', async () => {
    await adminDb.query(`UPDATE products SET name = 'Panino', category = 'Cibo', print_destination = 'kitchen' WHERE id = $1`, [t.productId]);
    const res = await admin.post('/orders', { items: [{ id: t.productId, name: 'Nome falso', category: 'Falsa', print_destination: 'bar', quantity: 1 }] });
    assert.equal(res.status, 200);
    const { rows: [order] } = await adminDb.query('SELECT items FROM orders WHERE id = $1', [res.body.orderId]);
    assert.equal(order.items[0].name, 'Panino');
    assert.equal(order.items[0].category, 'Cibo');
    assert.equal(order.items[0].print_destination, 'kitchen');
  });

  it('ordine in ritardo senza chiave di idempotenza: 400', async () => {
    const res = await admin.post('/orders', {
      items: [{ id: t.productId, name: 'Panino', quantity: 1 }],
      session_id: t.sessionId, client_created_at: new Date().toISOString(),
    });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /client_order_id/);
    const ok = await admin.post('/orders', {
      items: [{ id: t.productId, name: 'Panino', quantity: 1 }],
      session_id: t.sessionId, client_created_at: new Date().toISOString(), client_order_id: randomUUID(),
    });
    assert.equal(ok.status, 200);
  });

  it('il database rifiuta stati, ruoli e destinazioni non previsti', async () => {
    await assert.rejects(adminDb.query(`UPDATE orders SET status = 'boh' WHERE tenant_id = $1`, [t.id]).then(r => { if (!r.rowCount) throw new Error('nessun ordine'); }), /orders_status_check|nessun ordine/);
    await assert.rejects(adminDb.query(`INSERT INTO users (username, role, tenant_id) VALUES ('x', 'superuser', $1)`, [t.id]), /users_role_check/);
    await assert.rejects(adminDb.query(`UPDATE products SET print_destination = 'cucina' WHERE id = $1`, [t.productId]), /products_print_destination_check/);
  });

  it('password sotto gli 8 caratteri rifiutata alla creazione di un utente', async () => {
    const res = await admin.post('/auth/admin/createUser', { username: 'corta', role: 'cassa', password: '1234567' });
    assert.equal(res.status, 400);
  });

  it('dalla cartella assets si scaricano solo i suoni', async () => {
    const api = apiClient(server.port, t.host);
    assert.equal((await api.get('/assets/logo_5calzoni.png')).status, 404);
    assert.equal((await api.get('/assets/order_confirm_sound.mp3')).status, 200);
  });
});
