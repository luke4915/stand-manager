import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStats, buildSessionComparison } from '../utils/stats.js';

const base = {
  totals: { n: 4, total: '40.00', takeaway: 1, avg_minutes: 5.5 },
  canceled: { n: 1, total: '7.50' },
  byHour: [
    { hour: 20, n: 3, total: '30.00', avg_minutes: 5, n_minutes: 2 },
    { hour: 1, n: 1, total: '10.00', avg_minutes: null, n_minutes: 0 },
  ],
  products: [
    { product_id: 1, name: 'Panino', category: 'Cibo', quantity: '6', revenue: '30.00', missed: '0' },
    { product_id: 2, name: 'Birra', category: 'Bevande', quantity: '3', revenue: '10.00', missed: '0' },
    { product_id: 3, name: 'Acqua', category: 'Bevande', quantity: '2', revenue: '0', missed: '3.00' },
  ],
};

test('totali, medie e asporto', () => {
  const s = buildStats(base);
  assert.equal(s.totaleSerata, 40);
  assert.equal(s.importoMedio, 10);
  assert.equal(s.numeroTotaleOrdini, 4);
  assert.equal(s.takeawayCount, 1);
  assert.equal(s.eatInCount, 3);
  assert.equal(s.pctTakeaway, '25.0');
  assert.equal(s.canceledCount, 1);
  assert.equal(s.totaleStornato, 7.5);
  assert.equal(s.tempoMedioCompletamento, 5.5);
});

test('prodotti, categorie e omaggi', () => {
  const s = buildStats(base);
  assert.equal(s.prodottoPiuVenduto, 'Panino');
  assert.deepEqual(s.incassoPerCategoria, [{ categoria: 'Cibo', totale: 30 }, { categoria: 'Bevande', totale: 10 }]);
  assert.deepEqual(s.topGiftProducts, [{ product: 'Acqua', missedRevenue: 3 }]);
  assert.equal(s.unrealizedGiftRevenue, 3);
});

test('ore: 24 fasce, fatturato cumulato da mezzogiorno in poi', () => {
  const s = buildStats(base);
  assert.equal(s.ordiniPerFasciaOraria.length, 24);
  assert.equal(s.ordiniPerFasciaOraria[20].count, 3);
  assert.equal(s.prezzoMedioPerFasciaOraria[20].prezzoMedio, 10);
  assert.equal(s.andamentoFatturato[20].totale, 30);
  assert.equal(s.andamentoFatturato[1].totale, 40); // dopo mezzanotte il cumulo prosegue
  assert.equal(s.andamentoFatturato[5].totale, 0);
  assert.equal(s.tempiCompletamento[20].media, 5);
});

test('nessun ordine completato: solo gli annullati', () => {
  const s = buildStats({ totals: { n: 0, total: 0, takeaway: 0, avg_minutes: null }, canceled: { n: 2, total: '9' }, byHour: [], products: [] });
  assert.equal(s.numeroTotaleOrdini, 0);
  assert.equal(s.canceledCount, 2);
  assert.equal(s.totaleStornato, 9);
});

test('confronto tra serate', () => {
  const [a, b] = buildSessionComparison([
    { id: 1, name: 'Venerdì', start_time: '2026-10-02', n: 4, total: '40' },
    { id: 2, name: null, start_time: '2026-10-03T12:00:00Z', n: 0, total: '0' },
  ]);
  assert.deepEqual(a, { id: 1, name: 'Venerdì', totale: 40, numero: 4, medio: 10 });
  assert.equal(b.medio, 0);
  assert.ok(b.name);
});
