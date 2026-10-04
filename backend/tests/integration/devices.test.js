// Dispositivi e numerazione per cassa: lettere, isolamento tra tenant, unicità dei numeri.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'crypto';
import { startServer, createTenant, deleteTenants, closePools, apiClient, adminDb } from './helpers.js';

describe('dispositivi e numerazione per cassa', () => {
  let server, t1, t2, api1, api2;
  const order = (device, seq, extra = {}) => ({
    items: [{ id: t1.productId, name: 'Panino', quantity: 1 }], status: 'completed',
    device_id: device.id, device_seq: seq, ...extra,
  });

  before(async () => {
    server = await startServer();
    [t1, t2] = [await createTenant(), await createTenant()];
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

  it('assegna le lettere in ordine, anche con abbinamenti contemporanei', async () => {
    const results = await Promise.all(Array.from({ length: 12 }, () => api1.post('/devices')));
    assert.ok(results.every(r => r.status === 201));
    assert.deepEqual(results.map(r => r.body.letter).sort(), 'ABCDEFGHIJKL'.split(''));
    assert.match(results[0].body.name, /^Cassa [A-L]$/);
  });

  it('ogni tenant ha le sue lettere e non vede i dispositivi altrui', async () => {
    const own = await api2.post('/devices', { name: 'Bar' });
    assert.equal(own.body.letter, 'A');
    assert.equal(own.body.name, 'Bar');
    const list = await api2.get('/devices');
    assert.equal(list.body.length, 1);
    assert.equal((await api2.request('PUT', `/devices/${(await api1.get('/devices')).body[0].id}`, { name: 'x' })).status, 404);
  });

  it('il codice ordine è lettera + numero scelto dalla cassa; un numero già usato è respinto', async () => {
    const device = (await api1.post('/devices')).body;
    const first = await api1.post('/orders', order(device, 1));
    assert.equal(first.status, 200);
    assert.equal(first.body.displayCode, `${device.letter}1`);
    const jump = await api1.post('/orders', order(device, 7)); // offline: i numeri possono arrivare a salti
    assert.equal(jump.body.displayCode, `${device.letter}7`);
    const clash = await api1.post('/orders', order(device, 7));
    assert.equal(clash.status, 409);
    assert.equal(clash.body.code, 'DEVICE_SEQ_CONFLICT');
  });

  it('un nuovo invio dello stesso ordine restituisce quello esistente, anche in parallelo', async () => {
    const device = (await api1.post('/devices')).body;
    const key = randomUUID();
    const results = await Promise.all(Array.from({ length: 5 }, () => api1.post('/orders', order(device, 1, { client_order_id: key }))));
    assert.ok(results.every(r => r.status === 200));
    assert.equal(new Set(results.map(r => r.body.orderId)).size, 1);
    assert.equal(results[0].body.displayCode, `${device.letter}1`);
  });

  it('non accetta il dispositivo di un altro tenant', async () => {
    const foreign = (await api2.get('/devices')).body[0];
    const res = await api1.post('/orders', order(foreign, 1));
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'INVALID_DEVICE');
  });

  it('senza dispositivo vale ancora il progressivo di sessione (ordini accodati prima dell\'aggiornamento)', async () => {
    const res = await api1.post('/orders', { items: [{ id: t1.productId, name: 'Panino', quantity: 1 }], status: 'completed' });
    assert.equal(res.status, 200);
    assert.match(res.body.displayCode, /^[A-Z]\d+$/);
  });

  it('un dispositivo con ordini non si elimina; uno senza ordini sì', async () => {
    const used = (await api1.post('/devices')).body;
    await api1.post('/orders', order(used, 1));
    const refused = await api1.request('DELETE', `/devices/${used.id}`);
    assert.equal(refused.status, 409);
    assert.equal(refused.body.code, 'DEVICE_IN_USE');
    const unused = (await api1.post('/devices')).body;
    assert.equal((await api1.request('DELETE', `/devices/${unused.id}`)).status, 200);
  });

  it('dopo 26 dispositivi non ne assegna altri', async () => {
    await adminDb.query(
      `INSERT INTO devices (tenant_id, letter, name)
       SELECT $1, chr(l), 'x' FROM generate_series(65, 90) l
       WHERE chr(l) NOT IN (SELECT letter FROM devices WHERE tenant_id = $1)`, [t1.id]);
    const res = await api1.post('/devices');
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'DEVICE_LIMIT');
  });
});
