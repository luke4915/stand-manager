import { test } from 'node:test';
import assert from 'node:assert/strict';
import { minutesSince, urgency, activeOrders, upcomingByTable, withStatus } from './board.js';

const NOW = new Date('2026-10-05T20:00:00Z').getTime();
const ago = (min) => new Date(NOW - min * 60000).toISOString();
const order = (id, status, minutes, extra = {}) => ({ id, status, created_at: ago(minutes), order_type: 'sale', ...extra });

test('i minuti contano da quando la comanda è uscita, non da quando è stata creata', () => {
  assert.equal(minutesSince(order(1, 'pending', 30), NOW), 30);
  assert.equal(minutesSince(order(1, 'pending', 30, { fired_at: ago(4) }), NOW), 4);
  assert.equal(minutesSince(order(1, 'pending', -5), NOW), 0, 'mai negativo');
});

test('urgenza: normale, da sbrigare, in ritardo', () => {
  assert.deepEqual([0, 9, 10, 19, 20, 45].map(urgency), ['ok', 'ok', 'warn', 'warn', 'late', 'late']);
});

test('restano le comande da preparare, le più vecchie per prime, senza coperto', () => {
  const list = [order(1, 'pending', 3), order(2, 'preparing', 12), order(3, 'completed', 50), order(4, 'canceled', 40),
    order(5, 'scheduled', 1), order(6, 'pending', 1, { order_type: 'cover' }), order(7, 'pending', 12, { fired_at: ago(2) })];
  assert.deepEqual(activeOrders(list, NOW).map(o => [o.id, o.minutes]), [[2, 12], [1, 3], [7, 2]]);
});

test('a parità di tempo si segue l\'ordine di arrivo', () => {
  assert.deepEqual(activeOrders([order(9, 'pending', 5), order(8, 'pending', 5)], NOW).map(o => o.id), [8, 9]);
});

test('le portate in arrivo si raggruppano per tavolo, nell\'ordine d\'uscita', () => {
  const list = [
    order(1, 'scheduled', 1, { table_name: 'T4', course_seq: 3, course_name: 'Dolci' }),
    order(2, 'scheduled', 1, { table_name: 'T4', course_seq: 2, course_name: 'Primi' }),
    order(3, 'scheduled', 1, { table_name: 'T7', course_seq: 2, course_name: null }),
    order(4, 'pending', 1, { table_name: 'T4' }),
  ];
  assert.deepEqual(upcomingByTable(list), [{ table: 'T4', courses: ['Primi', 'Dolci'] }, { table: 'T7', courses: ['Subito'] }]);
});

test('il cambio di stato tocca solo quella comanda', () => {
  const list = [order(1, 'pending', 1), order(2, 'pending', 1)];
  assert.deepEqual(withStatus(list, 2, 'preparing').map(o => o.status), ['pending', 'preparing']);
});
