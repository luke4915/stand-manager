import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDisplayCode, formatDeviceCode } from '../utils/displayCode.js';

test('blocchi da 100 per lettera', () => {
  assert.equal(formatDisplayCode(1), 'A1');
  assert.equal(formatDisplayCode(100), 'A100');
  assert.equal(formatDisplayCode(101), 'B1');
  assert.equal(formatDisplayCode(250), 'C50');
});

test('dopo Z100 si riparte da A1', () => {
  assert.equal(formatDisplayCode(2600), 'Z100');
  assert.equal(formatDisplayCode(2601), 'A1');
});

test('codice da dispositivo: lettera della cassa + progressivo, senza tetto a 100', () => {
  assert.equal(formatDeviceCode('A', 1), 'A1');
  assert.equal(formatDeviceCode('B', 137), 'B137');
});
