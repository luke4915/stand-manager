import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findLayoutProblem } from '../utils/roomLayout.js';

const t = (name, x, y, w, h) => ({ name, x, y, w, h });

test('una pianta vuota o con tavoli non piazzati è valida', () => {
  assert.equal(findLayoutProblem({ gridW: 10, gridH: 10, tables: [] }), null);
  assert.equal(findLayoutProblem({ gridW: 10, gridH: 10, tables: [t('T1', null, null, null, null)] }), null);
});

test('i tavoli stanno dentro la griglia, bordo compreso', () => {
  assert.equal(findLayoutProblem({ gridW: 10, gridH: 6, tables: [t('T1', 8, 4, 2, 2)] }), null);
  assert.match(findLayoutProblem({ gridW: 10, gridH: 6, tables: [t('T1', 9, 4, 2, 2)] }), /T1.*esce/);
  assert.match(findLayoutProblem({ gridW: 10, gridH: 6, tables: [t('T1', 0, 5, 2, 2)] }), /esce/);
});

test('i tavoli non si sovrappongono, ma possono toccarsi', () => {
  assert.equal(findLayoutProblem({ gridW: 10, gridH: 10, tables: [t('A', 0, 0, 2, 2), t('B', 2, 0, 2, 2), t('C', 0, 2, 2, 2)] }), null);
  assert.match(findLayoutProblem({ gridW: 10, gridH: 10, tables: [t('A', 0, 0, 3, 3), t('B', 2, 2, 3, 3)] }), /"A" e "B" si sovrappongono/);
  assert.match(findLayoutProblem({ gridW: 10, gridH: 10, tables: [t('A', 0, 0, 6, 6), t('B', 1, 1, 1, 1)] }), /si sovrappongono/, 'uno dentro l\'altro');
});

test('muri e separatori: dentro la sala e mai sopra un tavolo, ma tra loro si toccano e si sovrappongono', () => {
  const tables = [t('T1', 2, 2, 2, 2)];
  const wall = (kind, x, y, w, h) => ({ kind, x, y, w, h });
  assert.equal(findLayoutProblem({ gridW: 10, gridH: 10, tables, elements: [wall('wall', 4, 0, 1, 10), wall('wall', 0, 4, 10, 1)] }), null, 'si incrociano');
  assert.equal(findLayoutProblem({ gridW: 10, gridH: 10, tables, elements: [wall('divider', 4, 2, 1, 2)] }), null, 'tocca il tavolo');
  assert.match(findLayoutProblem({ gridW: 10, gridH: 10, tables, elements: [wall('wall', 9, 0, 2, 1)] }), /muro esce dalla sala/);
  assert.match(findLayoutProblem({ gridW: 10, gridH: 10, tables, elements: [wall('divider', 3, 3, 2, 1)] }), /separatore copre il tavolo "T1"/);
  assert.equal(findLayoutProblem({ gridW: 10, gridH: 10, tables: [t('T9', null, null, null, null)], elements: [wall('wall', 0, 0, 3, 3)] }), null, 'tavolo non piazzato');
});
