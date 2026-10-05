import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitEqually, estimateSelection, payableLines, cartTotal, addToCart, tableState, formatEuro } from './checkMath.js';

test('quote uguali al centesimo: la somma è sempre esatta', () => {
  assert.deepEqual(splitEqually(10, 3), [3.34, 3.33, 3.33]);
  assert.deepEqual(splitEqually(10, 4), [2.5, 2.5, 2.5, 2.5]);
  assert.deepEqual(splitEqually(0.01, 3), [0.01, 0, 0]);
  for (const [euro, n] of [[99.99, 7], [100, 3], [1234.56, 11]])
    assert.equal(Math.round(splitEqually(euro, n).reduce((a, b) => a + b, 0) * 100), Math.round(euro * 100));
  assert.deepEqual(splitEqually(5, 0), [5], 'almeno una quota');
});

test('righe da pagare: solo comande attive con residuo', () => {
  const detail = { orders: [
    { status: 'pending', display_code: '1', items: [
      { line_id: 1, remaining_quantity: 2, remaining_amount: 10 },
      { line_id: 2, remaining_quantity: 0, remaining_amount: 0 },       // già pagata
      { line_id: 3, remaining_quantity: 1, remaining_amount: 0 },       // omaggio
    ] },
    { status: 'canceled', display_code: '2', items: [{ line_id: 4, remaining_quantity: 1, remaining_amount: 3 }] },
  ] };
  assert.deepEqual(payableLines(detail).map(l => l.line_id), [1]);
});

test('stima delle voci scelte come il server: proporzionale e l\'ultima quota prende il resto', () => {
  const lines = [{ line_id: 1, remaining_quantity: 3, remaining_amount: 29.99 }, { line_id: 2, remaining_quantity: 1, remaining_amount: 4.5 }];
  assert.equal(estimateSelection(lines, { 1: 1 }), 10);
  assert.equal(estimateSelection(lines, { 1: 3 }), 29.99);
  assert.equal(estimateSelection(lines, { 1: 1, 2: 1 }), 14.5);
  assert.equal(estimateSelection(lines, {}), 0);
});

test('carrello: righe uguali si sommano, lo stock è un limite, il totale è in centesimi', () => {
  const pizza = { id: 1, name: 'Pizza', price: 8.5, stock_enabled: false, stock: null, category: 'Pizze' };
  let { cart } = addToCart([], pizza);
  ({ cart } = addToCart(cart, pizza, 2));
  assert.equal(cart.length, 1);
  assert.equal(cart[0].quantity, 3);
  assert.equal(cartTotal(cart), 25.5);

  const wine = { id: 2, name: 'Vino', price: 6, stock_enabled: true, stock: 2 };
  let res = addToCart([], wine, 2);
  assert.equal(res.blocked, false);
  res = addToCart(res.cart, wine, 1);
  assert.equal(res.blocked, true);
  assert.equal(res.cart[0].quantity, 2);
});

test('stato del tavolo e formato euro', () => {
  assert.equal(tableState(null), 'free');
  assert.equal(tableState({ bill_requested_at: null }), 'busy');
  assert.equal(tableState({ bill_requested_at: '2026-10-04T20:00:00Z' }), 'bill');
  assert.equal(formatEuro(4.5), '4,50 €');
});

test('le opzioni scelte entrano nel prezzo; righe uguali solo con le stesse opzioni', () => {
  const steak = { id: 7, name: 'Tagliata', price: 18 };
  const rare = [{ id: 1, name: 'Al sangue', price: 0 }], rucola = [{ id: 1, name: 'Al sangue', price: 0 }, { id: 2, name: 'Rucola', price: 1.5 }];
  let { cart } = addToCart([], steak, 1, rucola);
  assert.equal(cart[0].price, 19.5);
  ({ cart } = addToCart(cart, steak, 1, [...rucola].reverse()));
  assert.equal(cart.length, 1, 'stesse opzioni in ordine diverso: stessa riga');
  assert.equal(cart[0].quantity, 2);
  ({ cart } = addToCart(cart, steak, 1, rare));
  assert.equal(cart.length, 2);
  assert.equal(cartTotal(cart), 19.5 * 2 + 18);
});
