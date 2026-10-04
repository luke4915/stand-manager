import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toOrderItemRow, toOrderItemRows } from '../utils/orderItems.js';

const full = { id: 61, name: 'Calzone', note: 'senza cipolla', type: 'discount', price: 2.5, category: 'Calzoni', quantity: 2, line_total: 5, discountMode: 'percent', discountValue: 50, original_price: 5, print_destination: 'kitchen' };

test('riga completa: tutti i campi riportati senza anomalie', () => {
  const { row, anomalies } = toOrderItemRow(full, 3);
  assert.deepEqual(anomalies, []);
  assert.deepEqual(row, {
    position: 3, product_id: 61, name: 'Calzone', category: 'Calzoni', print_destination: 'kitchen', quantity: 2,
    unit_price: 2.5, line_total: 5, original_price: 5, line_type: 'discount', discount_mode: 'percent', discount_value: 50, note: 'senza cipolla',
  });
});

test('riga vecchia senza line_total, categoria e destinazione: line_total = prezzo × quantità, nessuna anomalia', () => {
  const { row, anomalies } = toOrderItemRow({ id: 1, name: 'Birra', price: 4.5, quantity: 3, note: '' }, 0);
  assert.deepEqual(anomalies, []);
  assert.equal(row.line_total, 13.5);
  assert.equal(row.category, null);
  assert.equal(row.print_destination, null);
  assert.equal(row.line_type, 'sale');
});

test('prezzo unitario con più decimali (line_total / quantità) resta com\'è; il riferimento è line_total', () => {
  const { row } = toOrderItemRow({ id: 1, name: 'Combo', price: 1.6666666666666667, quantity: 3, line_total: 5 }, 0);
  assert.equal(row.unit_price, 1.6666666666666667);
  assert.equal(row.line_total, 5);
});

test('id fuori catalogo o non valido: product_id vuoto e segnalato, la riga si conserva', () => {
  assert.equal(toOrderItemRow({ id: 'abc', name: 'X', price: 1, quantity: 1 }, 0).row.product_id, null);
  assert.deepEqual(toOrderItemRow({ id: 'abc', name: 'X', price: 1, quantity: 1 }, 0).anomalies, ['id_non_valido']);
  assert.deepEqual(toOrderItemRow({ name: 'X', price: 1, quantity: 1 }, 0).anomalies, ['id_mancante']);
  assert.deepEqual(toOrderItemRow({ id: 1e20, name: 'X', price: 1, quantity: 1 }, 0).anomalies, ['id_non_valido']);
  assert.equal(toOrderItemRow({ id: 9007199254740, name: 'X', price: 1, quantity: 1 }, 0).row.product_id, 9007199254740, 'oltre integer ma sicuro in bigint');
});

test('quantità non valida: la riga non si può rappresentare, e lo si dice', () => {
  for (const quantity of [0, -1, 1.5, 'x', undefined]) {
    const { row, anomalies } = toOrderItemRow({ id: 1, name: 'X', price: 1, quantity }, 0);
    assert.equal(row, null);
    assert.deepEqual(anomalies, ['quantita_non_valida']);
  }
  assert.deepEqual(toOrderItemRow(null, 0).anomalies, ['riga_non_valida']);
});

test('tipo o destinazione sconosciuti: normalizzati e segnalati, mai scartati in silenzio', () => {
  const { row, anomalies } = toOrderItemRow({ id: 1, name: 'X', price: 1, quantity: 1, type: 'omaggio', print_destination: 'sala' }, 0);
  assert.equal(row.line_type, 'sale');
  assert.equal(row.print_destination, null);
  assert.deepEqual(anomalies, ['tipo_non_valido', 'destinazione_non_valida']);
});

test('più righe: posizioni nell\'ordine, anomalie raccolte; items non array o stringa JSON', () => {
  const { rows, anomalies } = toOrderItemRows([{ id: 1, name: 'A', price: 1, quantity: 1 }, { id: 2, name: 'B', price: 1, quantity: 0 }, { id: 3, name: 'C', price: 2, quantity: 2 }]);
  assert.deepEqual(rows.map(r => [r.position, r.name]), [[0, 'A'], [2, 'C']], 'la posizione è quella originale');
  assert.deepEqual(anomalies, ['quantita_non_valida']);

  assert.equal(toOrderItemRows(JSON.stringify([{ id: 1, name: 'A', price: 1, quantity: 1 }])).rows.length, 1);
  assert.deepEqual(toOrderItemRows('non json').anomalies, ['items_non_leggibili']);
  assert.deepEqual(toOrderItemRows({ a: 1 }).anomalies, ['items_non_array']);
  assert.deepEqual(toOrderItemRows([]), { rows: [], anomalies: [] });
});
