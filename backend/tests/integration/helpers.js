// Supporto ai test di integrazione: app avviata in memoria su una porta libera,
// database PostgreSQL locale vero (con RLS) e tenant di prova creati e cancellati
// da ogni file di test. Configurazione in backend/.env.test (vedi .env.test.example).
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
import pg from 'pg';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import WebSocket from 'ws';

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
dotenv.config({ path: path.join(backendDir, '.env.test'), override: true, quiet: true });

if (!process.env.TEST_DATABASE_URL || !process.env.JWT_SECRET) {
  throw new Error('Test di integrazione: crea backend/.env.test a partire da backend/.env.test.example');
}

// L'app si importa solo ora, dopo aver caricato la configurazione di test.
const { createApp } = await import('../../app.js');
const { createWebSocketHub } = await import('../../ws.js');
const { pool: appPool, masterPool } = await import('../../db.js');

export const PASSWORD = 'password-di-prova';

// Connessione privilegiata (superuser locale): prepara e ripulisce i dati, scavalcando la RLS.
export const adminDb = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 3 });

export async function startServer() {
  const hub = createWebSocketHub();
  const server = http.createServer(createApp({ broadcast: hub.broadcast, rateLimit: false }));
  hub.attach(server);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    port,
    close: () => new Promise(resolve => { hub.close(); server.close(resolve); }),
  };
}

// Ogni file di test gira in un processo suo: chiamala nell'after() di ogni file.
export async function closePools() {
  await Promise.all([adminDb.end(), appPool.end(), masterPool.end()]);
}

// Tenant di prova con un admin, un prodotto e (a richiesta) una sessione aperta.
export async function createTenant({ openSession = true, active = true } = {}) {
  const slug = `test-${randomUUID().slice(0, 8)}`;
  const { rows: [tenant] } = await adminDb.query(
    'INSERT INTO tenants (slug, name, active) VALUES ($1, $2, $3) RETURNING id', [slug, `Prova ${slug}`, active]);
  const hash = await bcrypt.hash(PASSWORD, 4);
  const { rows: [user] } = await adminDb.query(
    `INSERT INTO users (username, password_hash, role, tenant_id) VALUES ($1, $2, 'admin', $3) RETURNING id`,
    [`admin-${slug}`, hash, tenant.id]);
  const { rows: [product] } = await adminDb.query(
    `INSERT INTO products (name, price, category, tenant_id) VALUES ('Panino', 5, 'Cibo', $1) RETURNING id`, [tenant.id]);
  let sessionId = null;
  if (openSession) {
    ({ rows: [{ id: sessionId }] } = await adminDb.query(
      `INSERT INTO sessions (name, start_time, tenant_id) VALUES ('Serata di prova', now(), $1) RETURNING id`, [tenant.id]));
  }
  return { id: tenant.id, slug, host: `${slug}.standmanager.local`, username: `admin-${slug}`, userId: user.id, productId: product.id, sessionId };
}

const TENANT_TABLES = ['audit_logs', 'orders', 'devices', 'products', 'sessions', 'print_settings', 'copy_types', 'settings', 'users'];

export async function deleteTenants(...tenants) {
  for (const { id } of tenants) {
    for (const table of TENANT_TABLES) await adminDb.query(`DELETE FROM ${table} WHERE tenant_id = $1`, [id]);
    await adminDb.query('DELETE FROM tenants WHERE id = $1', [id]);
  }
}

// Client HTTP verso l'app di prova: imposta il sottodominio del tenant e tiene il cookie.
export function apiClient(port, host) {
  let cookie = null;
  const request = (method, apiPath, body, extraHeaders = {}) => new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const req = http.request({
      host: '127.0.0.1', port, method, path: `/api${apiPath}`,
      headers: {
        host,
        ...(cookie && { cookie }),
        ...(data && { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) }),
        ...extraHeaders,
      },
    }, (res) => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        const setCookie = res.headers['set-cookie']?.find(c => c.startsWith('token='));
        if (setCookie) cookie = setCookie.split(';')[0];
        let parsed = raw;
        try { parsed = raw ? JSON.parse(raw) : null; } catch { /* risposta non JSON (es. CSV) */ }
        resolve({ status: res.statusCode, body: parsed, headers: res.headers });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
  return {
    request,
    get: (p) => request('GET', p),
    post: (p, body) => request('POST', p, body ?? {}),
    put: (p, body) => request('PUT', p, body),
    login: (username, password = PASSWORD) => request('POST', '/auth/login', { username, password }),
    setToken: (token) => { cookie = token ? `token=${token}` : null; },
    get cookie() { return cookie; },
  };
}

// Token JWT costruito a mano (scadenze arbitrarie) per i test sul rinnovo della sessione.
export function signToken(tenant, claims = {}) {
  return jwt.sign({ id: tenant.userId, username: tenant.username, role: 'admin', tenantId: tenant.id, ...claims }, process.env.JWT_SECRET);
}

// Connessione WebSocket: staff con il cookie, oppure KDS pubblico. Raccoglie i messaggi ricevuti.
export function connectWs(port, host, { cookie, publicKds = false, origin = `https://${host}` } = {}) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/${publicKds ? '?kds=public' : ''}`, {
      headers: { host, origin, ...(cookie && { cookie }) },
    });
    const conn = { ws, messages: [], types: () => conn.messages.map(m => m.type).filter(t => t !== 'connected') };
    ws.on('message', (data) => conn.messages.push(JSON.parse(data)));
    ws.on('open', () => setTimeout(() => resolve({ ...conn, open: true }), 50));
    ws.on('close', (code) => resolve({ ...conn, closeCode: code }));
    ws.on('unexpected-response', (_req, res) => resolve({ ...conn, httpStatus: res.statusCode }));
    ws.on('error', () => {});
  });
}

export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
