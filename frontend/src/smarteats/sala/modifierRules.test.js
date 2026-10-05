import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toggleOption, isComplete, missingGroups, extraOf, toLineModifiers, groupHint, countIn } from './modifierRules.js';

const cottura = { id: 1, name: 'Cottura', min_select: 1, max_select: 1, options: [{ id: 10, name: 'Al sangue', price_delta: 0 }, { id: 11, name: 'Media', price_delta: 0 }] };
const aggiunte = { id: 2, name: 'Aggiunte', min_select: 0, max_select: 2, options: [{ id: 20, name: 'Parmigiano', price_delta: 1.5 }, { id: 21, name: 'Rucola', price_delta: 1 }, { id: 22, name: 'Bufala', price_delta: 2.3 }] };
const groups = [cottura, aggiunte];

test('scelta singola: la nuova sostituisce la precedente, e un secondo tocco la toglie', () => {
  let sel = toggleOption([], cottura, 10);
  assert.deepEqual(sel, [10]);
  sel = toggleOption(sel, cottura, 11);
  assert.deepEqual(sel, [11]);
  assert.deepEqual(toggleOption(sel, cottura, 11), []);
});

test('scelta multipla: si accende e si spegne, fino al massimo, senza toccare gli altri gruppi', () => {
  let sel = toggleOption([10], aggiunte, 20);
  sel = toggleOption(sel, aggiunte, 21);
  assert.deepEqual(sel, [10, 20, 21]);
  assert.deepEqual(toggleOption(sel, aggiunte, 22), sel, 'già due: la terza non entra');
  assert.deepEqual(toggleOption(sel, aggiunte, 20), [10, 21]);
});

test('senza limite si possono scegliere tutte', () => {
  const free = { ...aggiunte, max_select: null };
  assert.deepEqual([20, 21, 22].reduce((s, id) => toggleOption(s, free, id), []), [20, 21, 22]);
});

test('completo solo con i minimi rispettati', () => {
  assert.equal(isComplete([], groups), false);
  assert.equal(isComplete([20], groups), false);
  assert.equal(isComplete([10], groups), true);
  assert.deepEqual(missingGroups([20], groups).map(g => g.name), ['Cottura']);
  assert.deepEqual(missingGroups([10], groups), []);
  assert.equal(isComplete([], []), true, 'un piatto senza gruppi');
});

test('il supplemento si somma al centesimo', () => {
  assert.equal(extraOf([10, 20, 21], groups), 2.5);
  assert.equal(extraOf([20, 22], groups), 3.8);
  assert.equal(extraOf([], groups), 0);
  const cents = { id: 3, name: 'x', min_select: 0, max_select: null, options: [{ id: 1, name: 'a', price_delta: 0.1 }, { id: 2, name: 'b', price_delta: 0.2 }] };
  assert.equal(extraOf([1, 2], [cents]), 0.3);
});

test('le scelte diventano righe nell\'ordine dei gruppi', () => {
  assert.deepEqual(toLineModifiers([21, 10], groups), [{ id: 10, name: 'Al sangue', price: 0 }, { id: 21, name: 'Rucola', price: 1 }]);
  assert.equal(countIn([10, 20, 21], aggiunte), 2);
});

test('i suggerimenti dicono cosa serve', () => {
  assert.equal(groupHint(cottura), 'Scegli una');
  assert.equal(groupHint(aggiunte), 'Facoltativo, fino a 2');
  assert.equal(groupHint({ ...aggiunte, max_select: null }), 'Facoltativo');
  assert.equal(groupHint({ ...aggiunte, min_select: 1, max_select: 3 }), 'Da 1 a 3');
  assert.equal(groupHint({ ...cottura, min_select: 0 }), 'Facoltativo, una sola');
});
