import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sumQuantitiesByProduct } from '../utils/stock.js';

test('somma le righe dello stesso prodotto', () => {
  const totals = sumQuantitiesByProduct([
    { id: 1, quantity: 2 },
    { id: 2, quantity: 1 },
    { id: 1, quantity: 3 }, // stesso prodotto, es. riga in omaggio
  ]);
  assert.deepEqual([...totals], [[1, 5], [2, 1]]);
});

test('ordine vuoto → nessun prodotto', () => {
  assert.equal(sumQuantitiesByProduct([]).size, 0);
});
