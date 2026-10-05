// Statistiche del ristorante: coperti, scontrino medio, portate, tempi di cucina, sconti e incassi per metodo.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import { startServer, createTenant, deleteTenants, closePools, apiClient, adminDb, PASSWORD } from './helpers.js';

describe('statistiche ristorante', () => {
  let server, t, sagra, admin, waiter, sagraApi, tables, starter, main, wine;

  const stats = async (q = '') => (await admin.get(`/stats/restaurant?tz=Europe/Rome${q}`)).body;
  const line = (id, quantity = 1, extra = {}) => ({ id, name: 'x', quantity, ...extra });

  // Un tavolo: apre, ordina per portate, serve tutto, paga e chiude
  const table = async (tbl, covers, groups, method = 'cash') => {
    const check = (await admin.post('/checks', { table_id: tbl.id, covers })).body.id;
    const sent = await admin.post(`/checks/${check}/courses`, { groups, fire_first: true });
    assert.equal(sent.status, 201, JSON.stringify(sent.body));
    const detail = (await admin.get(`/checks/${check}`)).body;
    for (const o of sent.body.orders.filter(o => o.status === 'pending')) await admin.put(`/orders/${o.id}/lines`, { status: 'ready' });
    await admin.post(`/checks/${check}/fire`, {}).catch(() => {});
    const pay = await admin.post(`/checks/${check}/payments`, { method, amount: detail.total });
    return { check, pay, sent };
  };

  before(async () => {
    server = await startServer();
    [t, sagra] = [await createTenant({ businessType: 'ristorante' }), await createTenant()];
    admin = apiClient(server.port, t.host);
    await admin.login(t.username);
    sagraApi = apiClient(server.port, sagra.host);
    await sagraApi.login(sagra.username);
    await adminDb.query(`INSERT INTO users (username, password_hash, role, tenant_id) VALUES ($1, $2, 'cassa', $3)`, [`c-${t.slug}`, await bcrypt.hash(PASSWORD, 4), t.id]);
    waiter = apiClient(server.port, t.host);
    await waiter.login(`c-${t.slug}`);
    ({ rows: [{ id: wine }] } = await adminDb.query(`INSERT INTO products (name, price, category, print_destination, tenant_id) VALUES ('Vino', 20, 'Bevande', 'bar', $1) RETURNING id`, [t.id]));
    const room = (await admin.post('/rooms', { name: 'Sala' })).body;
    tables = (await admin.post(`/rooms/${room.id}/tables/bulk`, { prefix: 'T', from: 1, to: 4 })).body.created;
    starter = (await admin.post('/courses', { name: 'Antipasti' })).body;
    main = (await admin.post('/courses', { name: 'Primi' })).body;
  });
  after(async () => {
    await deleteTenants(t, sagra);
    await server.close();
    await closePools();
  });

  it('servizio vuoto: zeri e valori nulli, senza errori', async () => {
    const s = await stats();
    assert.equal(s.totals.checks, 0);
    assert.equal(s.totals.avgPerCover, null);
    assert.deepEqual(s.topProducts, []);
  });

  it('conta solo i conti pagati: coperti, scontrino medio, portate, piatti, metodi', async () => {
    // T1: 2 coperti, 2 panini (5 €) come antipasto + 1 vino (20 €) → 30 €, contanti
    await table(tables[0], 2, [{ course_id: starter.id, seq: 1, items: [line(t.productId, 2)] }, { course_id: null, seq: 1, items: [line(wine)] }]);
    // T2: 4 coperti, 3 panini come primi → 15 €, carta
    await table(tables[1], 4, [{ course_id: main.id, seq: 1, items: [line(t.productId, 3)] }], 'card');
    // T3: aperto e non pagato: non conta
    const open = (await admin.post('/checks', { table_id: tables[2].id, covers: 6 })).body.id;
    await admin.post(`/checks/${open}/courses`, { groups: [{ course_id: null, seq: 1, items: [line(t.productId, 9)] }] });

    const s = await stats();
    assert.equal(s.totals.checks, 2);
    assert.equal(s.totals.covers, 6);
    assert.equal(s.totals.revenue, 45);
    assert.equal(s.totals.avgCheck, 22.5);
    assert.equal(s.totals.avgPerCover, 7.5);
    assert.equal(s.totals.tablesUsed, 2);
    assert.equal(s.totals.rotation, 1);
    assert.ok(s.totals.avgDurationMinutes >= 0);
    assert.deepEqual(s.payments, [{ method: 'cash', amount: 30 }, { method: 'card', amount: 15 }]);
    assert.deepEqual(s.courses.map(c => [c.course, c.quantity, c.revenue]), [['Senza portata', 1, 20], ['Primi', 3, 15], ['Antipasti', 2, 10]]);
    assert.deepEqual(s.topProducts.map(p => [p.name, p.quantity]), [['Panino', 5], ['Vino', 1]]);
    assert.equal(s.byHour.reduce((n, h) => n + h.checks, 0), 2);
    assert.equal(s.byHour.reduce((n, h) => n + h.revenue, 0), 45);
    assert.ok(s.kitchen.dishes >= 2, 'righe pronte con il loro tempo');
    assert.equal(s.kitchen.avgMinutes >= 0, true);
  });

  it('sconti e omaggi: quanto è stato tolto e regalato', async () => {
    await table(tables[3], 2, [{ course_id: null, seq: 1, items: [line(wine, 1, { type: 'discount', discountMode: 'percent', discountValue: 25 }), line(t.productId, 2, { type: 'gift' })] }]);
    const s = await stats();
    assert.deepEqual(s.discounts, { discount: 5, gift: 10, lines: 2 });
  });

  it('filtro per servizio, e solo admin e responsabile nel locale giusto', async () => {
    assert.equal((await stats(`&sessions=${t.sessionId}`)).totals.checks, 3);
    assert.equal((await stats('&sessions=999999999')).totals.checks, 0);
    assert.equal((await waiter.get('/stats/restaurant?tz=Europe/Rome')).status, 403);
    assert.equal((await sagraApi.get('/stats/restaurant?tz=Europe/Rome')).status, 403, 'una sagra non ha i tavoli');
    assert.equal((await apiClient(server.port, t.host).get('/stats/restaurant')).status, 401);
  });
});
