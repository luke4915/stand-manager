import { test } from 'node:test';
import assert from 'node:assert/strict';
import { minutesSince, urgency, boardOrders, ticketAction, toggleLineStatus, upcomingByTable, withLineStatus, stationOf } from './board.js';

const NOW = new Date('2026-10-05T20:00:00Z').getTime();
const ago = (min) => new Date(NOW - min * 60000).toISOString();
const item = (line_id, dest, prep_status = 'new') => ({ line_id, print_destination: dest, prep_status, name: `P${line_id}`, quantity: 1 });
const order = (id, status, minutes, items = [item(id * 10, 'kitchen')], extra = {}) => ({ id, status, created_at: ago(minutes), order_type: 'sale', items, ...extra });

test('i minuti contano da quando la comanda è uscita, non da quando è stata creata', () => {
  assert.equal(minutesSince(order(1, 'pending', 30), NOW), 30);
  assert.equal(minutesSince(order(1, 'pending', 30, undefined, { fired_at: ago(4) }), NOW), 4);
  assert.equal(minutesSince(order(1, 'pending', -5), NOW), 0, 'mai negativo');
});

test('urgenza: normale, da sbrigare, in ritardo', () => {
  assert.deepEqual([0, 9, 10, 19, 20, 45].map(urgency), ['ok', 'ok', 'warn', 'warn', 'late', 'late']);
});

test('la postazione dipende da dove si stampa: bar solo bar, il resto cucina', () => {
  assert.deepEqual(['bar', 'kitchen', 'both', undefined].map(d => stationOf({ print_destination: d })), ['bar', 'kitchen', 'kitchen', 'kitchen']);
});

test('restano le comande da preparare, le più vecchie per prime, senza coperto', () => {
  const list = [order(1, 'pending', 3), order(2, 'preparing', 12), order(3, 'completed', 50), order(4, 'canceled', 40),
    order(5, 'scheduled', 1), order(6, 'pending', 1, undefined, { order_type: 'cover' }), order(7, 'pending', 12, undefined, { fired_at: ago(2) })];
  assert.deepEqual(boardOrders(list, 'all', NOW).map(o => [o.id, o.minutes]), [[2, 12], [1, 3], [7, 2]]);
});

test('ogni postazione vede solo le sue righe, e la comanda esce quando ha finito le sue', () => {
  const mixed = order(1, 'preparing', 5, [item(11, 'kitchen'), item(12, 'bar'), item(13, 'both', 'ready')]);
  const kitchen = boardOrders([mixed], 'kitchen', NOW);
  assert.deepEqual(kitchen[0].items.map(i => i.line_id), [11, 13], 'cucina e «bar + cucina»');
  assert.deepEqual(boardOrders([mixed], 'bar', NOW)[0].items.map(i => i.line_id), [12]);
  const barDone = order(1, 'preparing', 5, [item(11, 'kitchen'), item(12, 'bar', 'ready')]);
  assert.deepEqual(boardOrders([barDone], 'bar', NOW), [], 'il bar ha finito: la comanda esce dal suo monitor');
  assert.equal(boardOrders([barDone], 'kitchen', NOW).length, 1, 'ma resta in cucina');
  assert.equal(boardOrders([barDone], 'all', NOW).length, 1);
});

test('il pulsante: «Inizia» se nulla è partito, «Pronta» appena una riga è in preparazione; solo le righe da fare', () => {
  assert.deepEqual(ticketAction(order(1, 'pending', 1, [item(11, 'kitchen'), item(12, 'kitchen')])), { label: 'Inizia', status: 'preparing', lineIds: [11, 12] });
  assert.deepEqual(ticketAction(order(1, 'preparing', 1, [item(11, 'kitchen', 'preparing'), item(12, 'kitchen')])), { label: 'Pronta', status: 'ready', lineIds: [11, 12] });
  assert.deepEqual(ticketAction(order(1, 'preparing', 1, [item(11, 'kitchen', 'ready'), item(12, 'kitchen', 'preparing')])), { label: 'Pronta', status: 'ready', lineIds: [12] });
});

test('un tocco sulla riga la segna pronta, o la riporta in preparazione se già pronta', () => {
  assert.deepEqual(['new', 'preparing', 'ready', 'served'].map(s => toggleLineStatus({ prep_status: s })), ['ready', 'ready', 'preparing', 'preparing']);
});

test('le portate in arrivo si raggruppano per tavolo, nell\'ordine d\'uscita', () => {
  const list = [
    order(1, 'scheduled', 1, [], { table_name: 'T4', course_seq: 3, course_name: 'Dolci' }),
    order(2, 'scheduled', 1, [], { table_name: 'T4', course_seq: 2, course_name: 'Primi' }),
    order(3, 'scheduled', 1, [], { table_name: 'T7', course_seq: 2, course_name: null }),
    order(4, 'pending', 1, [], { table_name: 'T4' }),
  ];
  assert.deepEqual(upcomingByTable(list), [{ table: 'T4', courses: ['Primi', 'Dolci'] }, { table: 'T7', courses: ['Subito'] }]);
});

test('l\'aggiornamento a schermo tocca solo le righe indicate di quella comanda', () => {
  const list = [order(1, 'pending', 1, [item(11, 'kitchen'), item(12, 'bar')]), order(2, 'pending', 1, [item(21, 'kitchen')])];
  const next = withLineStatus(list, 1, [12], 'ready');
  assert.deepEqual(next[0].items.map(i => i.prep_status), ['new', 'ready']);
  assert.deepEqual(next[1].items.map(i => i.prep_status), ['new']);
});
