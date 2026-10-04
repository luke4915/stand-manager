import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeLineTotal, sanitizeAdjustment } from '../utils/pricing.js';
import * as front from '../../frontend/src/utils/pricing.js';

test('vendita: listino × quantità', () => {
  assert.equal(computeLineTotal(5, 2, { type: 'sale' }), 10);
  assert.equal(computeLineTotal(3.33, 3), 9.99);
});

test('omaggio: zero', () => {
  assert.equal(computeLineTotal(5, 4, { type: 'gift' }), 0);
});

test('sconto in euro: tolto all\'intera riga, mai sotto zero', () => {
  assert.equal(computeLineTotal(5, 2, { type: 'discount', discountMode: 'amount', discountValue: 4 }), 6);
  assert.equal(computeLineTotal(5, 3, { type: 'discount', discountMode: 'amount', discountValue: 1 }), 14);
  assert.equal(computeLineTotal(10, 1, { type: 'discount', discountMode: 'amount', discountValue: 50 }), 0);
});

test('sconto percentuale: arrotondato una sola volta sulla riga', () => {
  assert.equal(computeLineTotal(10, 1, { type: 'discount', discountMode: 'percent', discountValue: 25 }), 7.5);
  assert.equal(computeLineTotal(3.33, 3, { type: 'discount', discountMode: 'percent', discountValue: 10 }), 8.99);
  assert.equal(computeLineTotal(2.5, 7, { type: 'discount', discountMode: 'percent', discountValue: 15 }), 14.88);
  assert.equal(computeLineTotal(10, 1, { type: 'discount', discountMode: 'percent', discountValue: 150 }), 0);
});

test('cassa e server calcolano lo stesso importo, riga per riga', () => {
  const cases = [];
  for (const price of [0.1, 1.5, 2.5, 3.33, 4.99, 7])
    for (const quantity of [1, 2, 3, 7, 15])
      for (const adj of [
        { type: 'sale' }, { type: 'gift' },
        { type: 'discount', discountMode: 'amount', discountValue: 1 },
        { type: 'discount', discountMode: 'amount', discountValue: 0.33 },
        { type: 'discount', discountMode: 'percent', discountValue: 10 },
        { type: 'discount', discountMode: 'percent', discountValue: 15 },
        { type: 'discount', discountMode: 'percent', discountValue: 33.3 },
      ]) cases.push({ price, quantity, ...adj });
  for (const c of cases) {
    const { price, quantity, ...adj } = c;
    assert.equal(front.getLineTotal(c), computeLineTotal(price, quantity, adj), JSON.stringify(c));
  }
});

test('totale del carrello: somma di centesimi interi', () => {
  const cart = [
    { price: 0.1, quantity: 3, type: 'sale' },
    { price: 0.2, quantity: 3, type: 'sale' },
  ];
  assert.equal(front.getDiscountedTotal(cart), 0.9);
});

test('utente non autorizzato: sconti e omaggi forzati a vendita', () => {
  assert.deepEqual(
    sanitizeAdjustment({ type: 'gift' }, false),
    { type: 'sale', discountMode: null, discountValue: null }
  );
});

test('utente autorizzato: valori di sconto normalizzati', () => {
  assert.deepEqual(
    sanitizeAdjustment({ type: 'discount', discountMode: 'percent', discountValue: 140 }, true),
    { type: 'discount', discountMode: 'percent', discountValue: 100 }
  );
  assert.deepEqual(
    sanitizeAdjustment({ type: 'discount', discountMode: 'boh', discountValue: -5 }, true),
    { type: 'discount', discountMode: 'percent', discountValue: 0 }
  );
});
