import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeEffectivePrice, sanitizeAdjustment } from '../utils/pricing.js';

test('vendita: prezzo di listino', () => {
  assert.equal(computeEffectivePrice(5, { type: 'sale' }), 5);
});

test('omaggio: prezzo zero', () => {
  assert.equal(computeEffectivePrice(5, { type: 'gift' }), 0);
});

test('sconto percentuale e a importo, mai sotto zero', () => {
  assert.equal(computeEffectivePrice(10, { type: 'discount', discountMode: 'percent', discountValue: 25 }), 7.5);
  assert.equal(computeEffectivePrice(10, { type: 'discount', discountMode: 'amount', discountValue: 3 }), 7);
  assert.equal(computeEffectivePrice(10, { type: 'discount', discountMode: 'amount', discountValue: 50 }), 0);
  assert.equal(computeEffectivePrice(10, { type: 'discount', discountMode: 'percent', discountValue: 150 }), 0);
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
