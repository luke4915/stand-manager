import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canView, defaultView } from './viewRoles.js';

const ALL = ['kds', 'stats', 'qr_menu'];

test('il ruolo decide le pagine, i moduli quelle opzionali', () => {
  assert.equal(canView('admin', 'statistics', ALL), true);
  assert.equal(canView('admin', 'statistics', ['kds']), false, 'statistiche spente');
  assert.equal(canView('admin', 'kitchen', ['stats']), false, 'KDS spento');
  assert.equal(canView('cassa', 'statistics', ALL), false, 'ruolo non abilitato');
  assert.equal(canView('admin', 'dashboard', []), true, 'il nucleo non dipende dai moduli');
  assert.equal(canView('admin', 'config', []), true);
  assert.equal(canView('admin', 'inesistente', ALL), false);
});

test('utente salvato prima dei moduli (cache offline): non si nasconde nulla', () => {
  assert.equal(canView('admin', 'statistics', undefined), true);
  assert.equal(canView('cassa', 'statistics', undefined), false, 'il ruolo vale comunque');
});

test('prima pagina disponibile; nessuna se il ruolo non ha nulla di attivo', () => {
  assert.equal(defaultView('admin', ALL), 'dashboard');
  assert.equal(defaultView('cassa', ALL), 'dashboard');
  assert.equal(defaultView('cucina', ALL), 'kitchen');
  assert.equal(defaultView('cucina', ['stats']), null, 'cucina senza KDS');
});
