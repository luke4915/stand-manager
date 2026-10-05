import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRestaurantStats } from '../utils/restaurantStats.js';

const base = { checks: { n: 0, covers: 0, tables: 0, avg_minutes: null }, revenue: 0, byHour: [], courses: [], products: [], kitchen: [], discounts: { discount: 0, gift: 0, lines: 0 }, payments: [] };

test('servizio senza conti: niente divisioni per zero, valori vuoti', () => {
  const s = buildRestaurantStats(base);
  assert.deepEqual(s.totals, { revenue: 0, checks: 0, covers: 0, avgCheck: null, avgPerCover: null, avgDurationMinutes: null, tablesUsed: 0, rotation: null });
  assert.deepEqual(s.kitchen, { avgMinutes: null, kitchen: null, bar: null, dishes: 0 });
  assert.deepEqual(s.topProducts, []);
});

test('scontrino medio per conto e per coperto, durata e rotazione', () => {
  const s = buildRestaurantStats({ ...base, revenue: '1234.5', checks: { n: '20', covers: '58', tables: '10', avg_minutes: '71.6' } });
  assert.deepEqual(s.totals, { revenue: 1234.5, checks: 20, covers: 58, avgCheck: 61.73, avgPerCover: 21.28, avgDurationMinutes: 72, tablesUsed: 10, rotation: 2 });
});

test('ore in ordine, con importi numerici', () => {
  const s = buildRestaurantStats({ ...base, byHour: [{ hour: 21, n: 5, covers: 12, revenue: '300.00' }, { hour: 13, n: 2, covers: 6, revenue: '120.5' }] });
  assert.deepEqual(s.byHour.map(h => [h.hour, h.checks, h.covers, h.revenue]), [[13, 2, 6, 120.5], [21, 5, 12, 300]]);
});

test('portate per incasso; piatti per pezzi (poi incasso, poi nome), solo i primi dieci', () => {
  const products = Array.from({ length: 12 }, (_, i) => ({ product_id: String(i + 1), name: `P${String(i + 1).padStart(2, '0')}`, quantity: String(12 - i), revenue: '10' }));
  products.push({ product_id: '99', name: 'Zeta', quantity: '12', revenue: '50' });
  const s = buildRestaurantStats({ ...base, products, courses: [{ course: 'Antipasti', quantity: '5', revenue: '40' }, { course: 'Primi', quantity: '9', revenue: '90' }] });
  assert.equal(s.topProducts.length, 10);
  assert.deepEqual(s.topProducts.slice(0, 2).map(p => p.name), ['Zeta', 'P01'], 'a parità di pezzi vince l\'incasso');
  assert.equal(s.topProducts[0].id, 99);
  assert.deepEqual(s.courses.map(c => c.course), ['Primi', 'Antipasti']);
});

test('tempi di cucina: media pesata sui piatti, per postazione', () => {
  const s = buildRestaurantStats({ ...base, kitchen: [{ station: 'kitchen', avg_minutes: '14', n: 30 }, { station: 'bar', avg_minutes: '4', n: 10 }] });
  assert.deepEqual(s.kitchen, { avgMinutes: 12, kitchen: 14, bar: 4, dishes: 40 });
});

test('sconti, omaggi e metodi di pagamento', () => {
  const s = buildRestaurantStats({ ...base, discounts: { discount: '12.5', gift: '30', lines: 4 }, payments: [{ method: 'cash', amount: '100' }, { method: 'card', amount: '250.40' }] });
  assert.deepEqual(s.discounts, { discount: 12.5, gift: 30, lines: 4 });
  assert.deepEqual(s.payments, [{ method: 'card', amount: 250.4 }, { method: 'cash', amount: 100 }]);
});
