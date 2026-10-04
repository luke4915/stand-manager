import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateTempPassword } from './tempPassword.js';

test('password temporanea: 10 caratteri senza ambigui, accettata dal server (min 8), diversa a ogni giro', () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const p = generateTempPassword();
    assert.match(p, /^[a-hj-km-np-zA-HJ-NP-Z2-9]{10}$/);
    seen.add(p);
  }
  assert.equal(seen.size, 200);
});

test('byte scartati o troppo pochi non lasciano la password corta', () => {
  let calls = 0;
  const p = generateTempPassword(() => (calls++ === 0 ? new Uint8Array(20).fill(255) : new Uint8Array(20).fill(0)));
  assert.equal(p.length, 10);
});
