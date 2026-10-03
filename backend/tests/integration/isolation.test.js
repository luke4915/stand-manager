// Isolamento tra tenant: RLS sulle API, WebSocket ed endpoint pubblici.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, createTenant, deleteTenants, closePools, apiClient, connectWs, sleep } from './helpers.js';

describe('isolamento tra tenant', () => {
  let server, a, b, apiA, apiB;

  before(async () => {
    server = await startServer();
    [a, b] = await Promise.all([createTenant(), createTenant()]);
    apiA = apiClient(server.port, a.host);
    apiB = apiClient(server.port, b.host);
    await apiA.login(a.username);
    await apiB.login(b.username);
  });

  after(async () => {
    await deleteTenants(a, b);
    await server.close();
    await closePools();
  });

  it('ogni tenant vede solo i propri prodotti', async () => {
    const [resA, resB] = await Promise.all([apiA.get('/products'), apiB.get('/products')]);
    assert.deepEqual(resA.body.map(p => p.id), [a.productId]);
    assert.deepEqual(resB.body.map(p => p.id), [b.productId]);
  });

  it("l'utente di un tenant non entra dal sottodominio di un altro", async () => {
    const res = await apiClient(server.port, b.host).login(a.username);
    assert.equal(res.status, 401);
  });

  it('gli eventi WebSocket restano nel tenant, il KDS pubblico riceve dati ridotti', async () => {
    const [staffA, kdsA, staffB, kdsB] = await Promise.all([
      connectWs(server.port, a.host, { cookie: apiA.cookie }),
      connectWs(server.port, a.host, { publicKds: true }),
      connectWs(server.port, b.host, { cookie: apiB.cookie }),
      connectWs(server.port, b.host, { publicKds: true }),
    ]);
    assert.ok([staffA, kdsA, staffB, kdsB].every(c => c.open));

    const res = await apiA.post('/orders', { items: [{ id: a.productId, name: 'Panino', quantity: 2 }] });
    assert.equal(res.status, 200);
    await sleep(200);

    assert.ok(staffA.types().includes('order_created'));
    const publicOrder = kdsA.messages.find(m => m.type === 'order_created').order;
    assert.equal(publicOrder.total, undefined);
    assert.equal(publicOrder.items[0].price, undefined);
    assert.deepEqual(staffB.types(), []);
    assert.deepEqual(kdsB.types(), []);
    [staffA, kdsA, staffB, kdsB].forEach(c => c.ws.close());
  });

  it('il WebSocket rifiuta origini estranee, token assenti e tenant sbagliati', async () => {
    const evil = await connectWs(server.port, a.host, { cookie: apiA.cookie, origin: 'https://localhost.sito-esterno.com' });
    const noToken = await connectWs(server.port, a.host);
    const wrongTenant = await connectWs(server.port, b.host, { cookie: apiA.cookie });
    assert.equal(evil.httpStatus, 403);
    assert.equal(noToken.closeCode, 4401);
    assert.equal(wrongTenant.closeCode, 4403);
  });

  it('GET /orders/kds non espone totali né utenti', async () => {
    const res = await apiClient(server.port, a.host).get('/orders/kds');
    assert.equal(res.status, 200);
    assert.ok(res.body.length > 0);
    assert.equal(res.body[0].total, undefined);
    assert.equal(res.body[0].created_by, undefined);
  });
});
