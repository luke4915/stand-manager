import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveModifiers, withModifiers } from '../utils/modifiers.js';

const cottura = { id: 1, name: 'Cottura', min_select: 1, max_select: 1, options: [{ id: 10, name: 'Al sangue', price_delta: '0.00' }, { id: 11, name: 'Ben cotta', price_delta: '0' }] };
const aggiunte = { id: 2, name: 'Aggiunte', min_select: 0, max_select: 2, options: [{ id: 20, name: 'Parmigiano', price_delta: '1.50' }, { id: 21, name: 'Rucola', price_delta: '1' }, { id: 22, name: 'Bufala', price_delta: '2.30' }] };
const groups = [cottura, aggiunte];
const fails = (ids, code) => assert.throws(() => resolveModifiers(ids, groups, 'Tagliata'), (e) => e.status === 400 && e.code === code);

test('scelte valide: nome e supplemento dal catalogo, nell\'ordine dei gruppi, supplemento totale', () => {
  const r = resolveModifiers([21, 11, 20], groups, 'Tagliata');
  assert.deepEqual(r.modifiers, [{ id: 11, name: 'Ben cotta', price: 0 }, { id: 20, name: 'Parmigiano', price: 1.5 }, { id: 21, name: 'Rucola', price: 1 }]);
  assert.equal(r.extra, 2.5);
});

test('un gruppo obbligatorio va scelto; uno facoltativo no', () => {
  fails([], 'MODIFIER_REQUIRED');
  fails([20], 'MODIFIER_REQUIRED');
  assert.deepEqual(resolveModifiers([10], groups, 'Tagliata').modifiers.map(m => m.id), [10]);
});

test('al massimo quante ne dice il gruppo', () => {
  fails([10, 11], 'MODIFIER_TOO_MANY');
  fails([10, 20, 21, 22], 'MODIFIER_TOO_MANY');
  assert.equal(resolveModifiers([10, 20, 22], groups, 'Tagliata').extra, 3.8);
});

test('opzioni inventate, di altri prodotti o ripetute si rifiutano', () => {
  fails([10, 999], 'INVALID_MODIFIER');
  fails([10, 20, 20], 'INVALID_MODIFIER');
});

test('un prodotto senza gruppi non ammette opzioni, e senza opzioni va bene', () => {
  assert.deepEqual(resolveModifiers([], [], 'Acqua'), { modifiers: [], extra: 0 });
  assert.deepEqual(resolveModifiers(undefined, [], 'Acqua'), { modifiers: [], extra: 0 });
  assert.throws(() => resolveModifiers([10], [], 'Acqua'), (e) => e.code === 'INVALID_MODIFIER');
});

test('un supplemento negativo (es. «senza formaggio, -0,50») è ammesso', () => {
  const g = { id: 3, name: 'Togli', min_select: 0, max_select: null, options: [{ id: 30, name: 'Senza formaggio', price_delta: '-0.50' }] };
  assert.equal(resolveModifiers([30], [g], 'Pasta').extra, -0.5);
});

test('i supplementi si sommano al centesimo, senza errori di virgola mobile', () => {
  const g = { id: 3, name: 'X', min_select: 0, max_select: null, options: [{ id: 1, name: 'a', price_delta: '0.10' }, { id: 2, name: 'b', price_delta: '0.20' }] };
  assert.equal(resolveModifiers([1, 2], [g], 'P').extra, 0.3);
});

test('testo per cucina e ricevuta', () => {
  assert.equal(withModifiers('Tagliata', [{ name: 'Al sangue' }, { name: 'Rucola' }]), 'Tagliata · Al sangue, Rucola');
  assert.equal(withModifiers('Acqua', []), 'Acqua');
  assert.equal(withModifiers('Acqua', undefined), 'Acqua');
});
