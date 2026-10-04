import { test } from 'node:test';
import assert from 'node:assert/strict';
import { itemsFromQr } from './qrCart.js';

const products = [{ id: 1, name: 'Panino', price: '5.00', category: 'Cibo' }, { id: 2, name: 'Birra', price: '4.00' }];

test('nome e prezzo vengono dal catalogo, non dal QR', () => {
  const [item] = itemsFromQr([{ id: 1, name: 'Gratis', price: 0, quantity: 2, type: 'gift' }], products);
  assert.equal(item.name, 'Panino');
  assert.equal(item.price, '5.00');
  assert.equal(item.quantity, 2);
  assert.equal(item.type, 'sale');
});

test('prodotti sconosciuti e quantità non valide si scartano', () => {
  const items = itemsFromQr([{ id: 99, quantity: 1 }, { id: 1, quantity: 0 }, { id: 2, quantity: -3 }, { id: 2, quantity: 'x' }, null, { id: 2, quantity: 5000 }], products);
  assert.deepEqual(items.map(i => [i.id, i.quantity]), [[2, 999]]);
});

test('contenuto che non è un elenco: nessuna riga', () => {
  assert.deepEqual(itemsFromQr({ id: 1 }, products), []);
});
