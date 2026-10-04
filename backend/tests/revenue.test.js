import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isRevenue } from '../utils/revenue.js';

const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('oggi un ordine è incasso quando è completato, con l\'alias richiesto', () => {
  assert.equal(isRevenue(), "o.status = 'completed'");
  assert.equal(isRevenue('x'), "x.status = 'completed'");
});

// L'incasso si definisce in utils/revenue.js. Chi riscrive `status = 'completed'` in una query sugli ordini
// ricrea una seconda definizione, che con i conti dei tavoli si disallineerebbe senza che nessuno se ne accorga.
// Sono ammessi solo i passaggi di stato (non sono incassi): completare gli ordini a chiusura serata e annullo rapido.
test('nessun SQL fuori da revenue.js riscrive la regola dell\'incasso', () => {
  const files = ['routes', 'utils'].flatMap((dir) => fs.readdirSync(path.join(backend, dir)).filter(f => f.endsWith('.js')).map(f => `${dir}/${f}`));
  const allowed = new Set(['utils/revenue.js', 'routes/sessions.js', 'routes/orders.js']);
  const offenders = files.filter((f) => !allowed.has(f) && /status\s*=\s*'completed'/.test(fs.readFileSync(path.join(backend, f), 'utf8')));
  assert.deepEqual(offenders, [], `usa isRevenue() invece di status = 'completed': ${offenders.join(', ')}`);
});
