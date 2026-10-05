import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyPlan, orderedKeys, buildGroups, moveGroup, toggleTogether, toPayload, courseOfProduct, sendSummary } from './courses.js';

const courses = [{ id: 10, name: 'Antipasti' }, { id: 20, name: 'Primi' }, { id: 30, name: 'Dolci' }];
const line = (id, course_id, quantity = 1) => ({ id, name: `P${id}`, quantity, note: '', print_destination: 'both', course_id });

test('i gruppi seguono l\'ordine del locale, «Subito» per primo, anche se il carrello è in disordine', () => {
  const cart = [line(1, 30), line(2, 20), line(3, null), line(4, 10), line(5, 20)];
  const groups = buildGroups(cart, courses, emptyPlan());
  assert.deepEqual(groups.map(g => [g.name, g.seq, g.lines.length]), [['Subito', 1, 1], ['Antipasti', 2, 1], ['Primi', 3, 2], ['Dolci', 4, 1]]);
});

test('«insieme» dà lo stesso numero d\'uscita al precedente; sul primo gruppo non ha effetto', () => {
  const cart = [line(1, 10), line(2, 20), line(3, 30)];
  let plan = toggleTogether(emptyPlan(), 20);
  assert.deepEqual(buildGroups(cart, courses, plan).map(g => g.seq), [1, 1, 2]);
  plan = toggleTogether(plan, 10);
  assert.deepEqual(buildGroups(cart, courses, plan).map(g => [g.together, g.seq]), [[false, 1], [true, 1], [false, 2]], 'il primo non è mai «insieme»');
  plan = toggleTogether(plan, 20);
  assert.deepEqual(buildGroups(cart, courses, plan).map(g => g.seq), [1, 2, 3], 'si toglie');
});

test('si riordinano i gruppi, fino ai bordi', () => {
  const cart = [line(1, 10), line(2, 20), line(3, 30)];
  let plan = moveGroup(cart, courses, emptyPlan(), 30, -1);
  assert.deepEqual(orderedKeys(cart, courses, plan), [10, 30, 20]);
  plan = moveGroup(cart, courses, plan, 30, -1);
  assert.deepEqual(orderedKeys(cart, courses, plan), [30, 10, 20]);
  assert.equal(moveGroup(cart, courses, plan, 30, -1), plan, 'già primo: niente cambia');
  assert.equal(moveGroup(cart, courses, plan, 20, 1), plan, 'già ultimo');
  assert.equal(moveGroup(cart, courses, plan, 99, 1), plan, 'gruppo inesistente');
});

test('un gruppo che compare dopo il riordino prende il suo posto naturale', () => {
  let cart = [line(1, 10), line(2, 30)];
  const plan = moveGroup(cart, courses, emptyPlan(), 30, -1);
  cart = [...cart, line(3, 20)];
  assert.deepEqual(orderedKeys(cart, courses, plan), [30, 10, 20]);
});

test('una portata eliminata dal locale non rompe la comanda', () => {
  const groups = buildGroups([line(1, 99), line(2, 10)], courses, emptyPlan());
  assert.deepEqual(groups.map(g => g.name), ['Antipasti', 'Portata']);
});

test('il payload porta solo id, quantità, nota e destinazione, con l\'ordine d\'uscita', () => {
  const groups = buildGroups([line(1, 10, 2), line(2, 20)], courses, toggleTogether(emptyPlan(), 20));
  assert.deepEqual(toPayload(groups), [
    { course_id: 10, seq: 1, items: [{ id: 1, name: 'P1', quantity: 2, note: '', print_destination: 'both' }] },
    { course_id: 20, seq: 1, items: [{ id: 2, name: 'P2', quantity: 1, note: '', print_destination: 'both' }] },
  ]);
});

test('la portata di un prodotto vale solo se il locale la ha ancora', () => {
  assert.equal(courseOfProduct({ course_id: 20 }, courses), 20);
  assert.equal(courseOfProduct({ course_id: 99 }, courses), null);
  assert.equal(courseOfProduct({}, courses), null);
});

test('riepilogo invio: esce il primo numero d\'uscita, il resto aspetta', () => {
  const groups = buildGroups([line(1, 10), line(2, 20), line(3, 30)], courses, toggleTogether(emptyPlan(), 20));
  const s = sendSummary(groups, true);
  assert.deepEqual([s.now.map(g => g.name), s.later.map(g => g.name)], [['Antipasti', 'Primi'], ['Dolci']]);
  assert.deepEqual(sendSummary(groups, false).now, []);
  assert.deepEqual(sendSummary([], true), { now: [], later: [] });
});
