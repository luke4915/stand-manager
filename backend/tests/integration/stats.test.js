// Statistiche calcolate dal database e elenco ordini paginato.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import { startServer, createTenant, deleteTenants, closePools, apiClient, adminDb, PASSWORD } from './helpers.js';

describe('statistiche e paginazione', () => {
  let server, t, admin, cashier, s1, s2, otherProduct;

  const insertOrder = async ({ session, status = 'completed', items, total, takeaway = false, at, completedAfterMin = null }) => {
    const { rows: [o] } = await adminDb.query(
      `INSERT INTO orders (items, total, status, session_id, is_takeaway, created_at, completed_at, tenant_id, order_type)
       VALUES ($1, $2, $3, $4, $5, $6, $6::timestamptz + ($7 || ' minutes')::interval, $8, 'sale') RETURNING id`,
      [JSON.stringify(items), total, status, session, takeaway, at, completedAfterMin === null ? null : String(completedAfterMin), t.id]);
    return o.id;
  };
  const line = (id, name, quantity, line_total, extra = {}) => ({ id, name, quantity, price: line_total / quantity, line_total, category: 'Cibo', ...extra });

  before(async () => {
    server = await startServer();
    t = await createTenant();
    admin = apiClient(server.port, t.host);
    await admin.login(t.username);
    await adminDb.query(`INSERT INTO users (username, password_hash, role, tenant_id) VALUES ($1, $2, 'cassa', $3)`, [`cassa-${t.slug}`, await bcrypt.hash(PASSWORD, 4), t.id]);
    cashier = apiClient(server.port, t.host);
    await cashier.login(`cassa-${t.slug}`);

    s1 = t.sessionId;
    await adminDb.query(`UPDATE sessions SET name = 'Venerdì', start_time = '2026-10-02T10:00:00Z', end_time = '2026-10-03T02:00:00Z' WHERE id = $1`, [s1]);
    ({ rows: [{ id: s2 }] } = await adminDb.query(`INSERT INTO sessions (name, start_time, tenant_id) VALUES ('Sabato', '2026-10-03T10:00:00Z', $1) RETURNING id`, [t.id]));
    ({ rows: [{ id: otherProduct }] } = await adminDb.query(`INSERT INTO products (name, price, category, tenant_id) VALUES ('Birra', 4, 'Bevande', $1) RETURNING id`, [t.id]));

    const P = t.productId;
    // venerdì (Europe/Rome = UTC+2): 20:00 e 20:30 locali, più uno a mezzanotte e mezza
    await insertOrder({ session: s1, items: [line(P, 'Panino', 2, 10), line(otherProduct, 'Birra', 1, 4, { category: 'Bevande' })], total: 14, at: '2026-10-02T18:00:00Z', completedAfterMin: 4 });
    await insertOrder({ session: s1, items: [line(P, 'Panino', 1, 0, { original_price: 5 })], total: 0, takeaway: true, at: '2026-10-02T18:30:00Z', completedAfterMin: 6 });
    await insertOrder({ session: s1, items: [line(otherProduct, 'Birra', 2, 8, { category: 'Bevande' })], total: 8, at: '2026-10-02T22:30:00Z' });
    await insertOrder({ session: s1, status: 'canceled', items: [line(P, 'Panino', 1, 5)], total: 5, at: '2026-10-02T19:00:00Z' });
    await insertOrder({ session: s1, status: 'pending', items: [line(P, 'Panino', 9, 45)], total: 45, at: '2026-10-02T19:10:00Z' });
    // sabato: il prodotto è stato rinominato nell'ordine (stesso id)
    await insertOrder({ session: s2, items: [line(P, 'Panino vecchio nome', 3, 15)], total: 15, at: '2026-10-03T18:00:00Z' });
    // ordini vecchi: righe fuori catalogo con un id enorme (un timestamp), che non entra in un integer
    await insertOrder({ session: s2, items: [line(1764492954740, 'Riga libera', 1, 2, { category: 'Altro' })], total: 2, at: '2026-10-03T19:00:00Z' });
  });

  after(async () => {
    await deleteTenants(t);
    await server.close();
    await closePools();
  });

  it('totali sulla serata: completati contati, in attesa esclusi, annullati a parte', async () => {
    const res = await admin.get(`/stats?sessions=${s1}&tz=Europe/Rome`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const s = res.body;
    assert.equal(s.numeroTotaleOrdini, 3);
    assert.equal(s.totaleSerata, 22);
    assert.equal(s.takeawayCount, 1);
    assert.equal(s.canceledCount, 1);
    assert.equal(s.totaleStornato, 5);
    assert.equal(s.tempoMedioCompletamento, 5);
    // omaggio: mancato incasso a prezzo di listino salvato nell'ordine
    assert.equal(s.unrealizedGiftRevenue, 5);
    assert.deepEqual(s.topGiftProducts, [{ product: 'Panino', missedRevenue: 5 }]);
  });

  it('ore nel fuso richiesto e fatturato cumulato', async () => {
    const s = (await admin.get(`/stats?sessions=${s1}&tz=Europe/Rome`)).body;
    assert.equal(s.ordiniPerFasciaOraria[20].count, 2); // 18:00Z e 18:30Z = 20:00 e 20:30 a Roma
    assert.equal(s.ordiniPerFasciaOraria[0].count, 1);  // 22:30Z = 00:30
    assert.equal(s.andamentoFatturato[20].totale, 14);
    assert.equal(s.andamentoFatturato[0].totale, 22);
    const utc = (await admin.get(`/stats?sessions=${s1}&tz=UTC`)).body;
    assert.equal(utc.ordiniPerFasciaOraria[18].count, 2);
  });

  it('prodotti per id (un prodotto rinominato resta uno) e categorie, su tutte le serate', async () => {
    const s = (await admin.get('/stats')).body;
    assert.equal(s.numeroTotaleOrdini, 5);
    assert.ok(s.topProdotti.some(p => p.productId === 1764492954740));
    const panino = s.topProdotti.find(p => p.productId === t.productId);
    assert.equal(panino.count, 6);
    assert.equal(panino.revenue, 25);
    assert.equal(s.topProdotti.filter(p => p.productId === t.productId).length, 1);
    assert.deepEqual(s.incassoPerCategoria, [{ categoria: 'Cibo', totale: 25 }, { categoria: 'Bevande', totale: 12 }, { categoria: 'Altro', totale: 2 }]);
    assert.equal(s.confrontoSerate.length, 2);
    assert.deepEqual(s.confrontoSerate.find(x => x.id === s2), { id: s2, name: 'Sabato', totale: 17, numero: 2, medio: 8.5 });
  });

  it('confronto tra due serate', async () => {
    const shared = (await admin.get(`/stats/shared-products?a=${s1}&b=${s2}`)).body;
    assert.deepEqual(shared.map(p => p.id), [t.productId]); // la birra è venduta solo venerdì
    const all = (await admin.get('/stats/shared-products')).body;
    assert.equal(all.length, 3);
    const h2h = (await admin.get(`/stats/head-to-head?a=${s1}&b=${s2}&product=${t.productId}`)).body;
    assert.deepEqual(h2h, [{ metric: 'Quantità venduta', A: 3, B: 3 }, { metric: 'Incasso (€)', A: 10, B: 15 }]);
  });

  it('parametri non validi e permessi', async () => {
    assert.equal((await admin.get('/stats?sessions=abc')).status, 400);
    assert.equal((await admin.get('/stats?tz=Marte/Olimpo')).status, 400);
    assert.equal((await admin.get(`/stats/head-to-head?a=${s1}`)).status, 400);
    assert.equal((await cashier.get('/stats')).status, 403);
  });

  it('elenco ordini: pagine con before, filtro per stato, limite massimo', async () => {
    const first = (await admin.get('/orders?limit=2')).body;
    assert.equal(first.length, 2);
    const second = (await admin.get(`/orders?limit=2&before=${first[1].id}`)).body;
    assert.equal(second.length, 2);
    assert.ok(second[0].id < first[1].id);
    const pending = (await admin.get('/orders?status=pending')).body;
    assert.ok(pending.length === 1 && pending[0].status === 'pending');
    assert.equal((await admin.get('/orders?limit=100000')).status, 400);
    assert.equal((await admin.get('/orders?status=boh')).status, 400);
    const all = (await admin.get('/orders?limit=500')).body;
    assert.equal(all.length, 7);
  });
});
