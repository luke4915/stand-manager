import { test } from 'node:test';
import assert from 'node:assert/strict';
import { visibleViews, canViewSmartEats, smartEatsHome, usesSmartEats } from './views.js';

const ids = (role, modules) => visibleViews(role, modules).map(v => v.id);

test('ogni ruolo vede le sue pagine', () => {
  const all = ['kds', 'stats', 'tables'];
  assert.deepEqual(ids('admin', all), ['sala', 'cucina', 'carta', 'statistiche', 'impostazioni']);
  assert.deepEqual(ids('responsabile', all), ['sala', 'statistiche']);
  assert.deepEqual(ids('cassa', all), ['sala']);
  assert.deepEqual(ids('cucina', all), ['cucina']);
});

test('i moduli spenti nascondono le pagine', () => {
  assert.deepEqual(ids('admin', ['tables']), ['sala', 'carta', 'impostazioni']);
  assert.equal(canViewSmartEats('cucina', 'cucina', ['stats']), false);
  assert.equal(smartEatsHome('cucina', ['stats']), null);
});

test('senza elenco dei moduli (cache offline) non si nasconde nulla', () => {
  assert.equal(canViewSmartEats('cucina', 'cucina', undefined), true);
});

test('la home è la prima pagina visibile', () => {
  assert.equal(smartEatsHome('admin', ['kds']), 'sala');
  assert.equal(smartEatsHome('cucina', ['kds']), 'cucina');
});

test('solo il tipo ristorante usa SmartEats', () => {
  assert.equal(usesSmartEats({ businessType: 'ristorante' }), true);
  assert.equal(usesSmartEats({ businessType: 'sagra' }), false);
  assert.equal(usesSmartEats({ businessType: 'paninaro' }), false);
  assert.equal(usesSmartEats(null), false);
});
