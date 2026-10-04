import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conflictIds, moveBy, resizeBy, defaultSize, findFreeSpot } from './geometry.js';

const t = (id, x, y, w, h) => ({ id, x, y, w, h });

test('conflitti: fuori dalla sala e sovrapposizioni, non il semplice contatto', () => {
  assert.deepEqual([...conflictIds([t(1, 0, 0, 2, 2), t(2, 2, 0, 2, 2)], 10, 10)], []);
  assert.deepEqual([...conflictIds([t(1, 0, 0, 3, 3), t(2, 2, 2, 2, 2), t(3, 8, 8, 2, 2)], 10, 10)].sort(), [1, 2]);
  assert.deepEqual([...conflictIds([t(1, 9, 0, 2, 2)], 10, 10)], [1]);
  assert.deepEqual([...conflictIds([t(1, null, null, null, null)], 10, 10)], [], 'da piazzare: nessun conflitto');
});

test('lo spostamento si ferma ai bordi', () => {
  assert.deepEqual(moveBy(t(1, 1, 1, 2, 2), -5, -5, 10, 8), { x: 0, y: 0 });
  assert.deepEqual(moveBy(t(1, 1, 1, 2, 2), 50, 50, 10, 8), { x: 8, y: 6 });
  assert.deepEqual(moveBy(t(1, 1, 1, 2, 2), 2, 1, 10, 8), { x: 3, y: 2 });
});

test('la misura va da 1 al bordo della sala', () => {
  assert.deepEqual(resizeBy(t(1, 0, 0, 2, 2), -5, -5, 10, 8), { w: 1, h: 1 });
  assert.deepEqual(resizeBy(t(1, 7, 5, 2, 2), 9, 9, 10, 8), { w: 3, h: 3 });
});

test('misura iniziale dai posti', () => {
  assert.deepEqual(defaultSize(2), { w: 2, h: 2 });
  assert.deepEqual(defaultSize(4), { w: 3, h: 2 });
  assert.deepEqual(defaultSize(99), { w: 8, h: 2 });
});

test('primo posto libero, o null se piena', () => {
  assert.deepEqual(findFreeSpot([], 10, 10, 2, 2), { x: 0, y: 0 });
  assert.deepEqual(findFreeSpot([t(1, 0, 0, 2, 2)], 10, 10, 2, 2), { x: 2, y: 0 });
  assert.deepEqual(findFreeSpot([t(1, 0, 0, 4, 2)], 4, 4, 2, 2), { x: 0, y: 2 });
  assert.equal(findFreeSpot([t(1, 0, 0, 4, 4)], 4, 4, 1, 1), null);
});
