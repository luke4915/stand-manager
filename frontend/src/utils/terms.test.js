import { test } from 'node:test';
import assert from 'node:assert/strict';
import { termsFor, TERM_SETS } from './terms.js';

test('ristorante: servizi; sagre e paninari: serate', () => {
  assert.equal(termsFor('ristorante').unit, 'servizio');
  assert.equal(termsFor('sagra').unit, 'serata');
  assert.equal(termsFor('paninaro').unit, 'serata');
  assert.equal(termsFor(undefined).unit, 'serata', 'cache offline senza tipo: come prima');
});

test('i due vocabolari hanno le stesse voci, tutte compilate', () => {
  assert.deepEqual(Object.keys(TERM_SETS.serata).sort(), Object.keys(TERM_SETS.servizio).sort());
  for (const set of Object.values(TERM_SETS)) for (const [key, text] of Object.entries(set)) assert.ok(text.trim(), key);
});
