import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isRevenue, expectedCashSql } from '../utils/revenue.js';

const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('la regola: ordine pagato subito completato, oppure ordine non annullato di un conto pagato', () => {
  const rule = isRevenue('x').replace(/\s+/g, ' ');
  assert.match(rule, /x\.check_id IS NULL AND x\.status = 'completed'/);
  assert.match(rule, /x\.check_id IS NOT NULL AND x\.status <> 'canceled'/);
  assert.match(rule, /rc\.id = x\.check_id AND rc\.status = 'paid'/);
  assert.match(isRevenue(), /\bo\.check_id\b/, 'alias predefinito: o');
});

test('i contanti attesi contano solo i pagamenti in contanti dei conti', () => {
  const sql = expectedCashSql('$3').replace(/\s+/g, ' ');
  assert.match(sql, /p\.method = 'cash'/);
  assert.match(sql, /o\.session_id = \$3/);
  assert.match(sql, /c\.session_id = \$3/);
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
