import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSecrets } from '../utils/jwtConfig.js';

const long = (c) => c.repeat(40);

test('segreti lunghi e diversi: nessun problema', () => {
  assert.deepEqual(checkSecrets({ JWT_SECRET: long('a'), MASTER_JWT_SECRET: long('b') }), { missing: [], weak: [] });
});

test('segreto assente, corto o uguale all\'altro', () => {
  assert.equal(checkSecrets({ JWT_SECRET: long('a') }).missing.length, 1);
  assert.equal(checkSecrets({ JWT_SECRET: 'corto', MASTER_JWT_SECRET: long('b') }).weak.length, 1);
  assert.equal(checkSecrets({ JWT_SECRET: long('a'), MASTER_JWT_SECRET: long('a') }).weak.length, 1);
});
