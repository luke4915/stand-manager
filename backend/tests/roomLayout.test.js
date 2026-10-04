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
