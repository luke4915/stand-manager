import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampToSession } from '../utils/session.js';

const session = { start_time: '2026-10-03T18:00:00.000Z', end_time: '2026-10-03T23:59:00.000Z' };

test("un'ora dentro la sessione resta invariata", () => {
  assert.equal(clampToSession('2026-10-03T21:30:00.000Z', session), '2026-10-03T21:30:00.000Z');
});

test('orologio indietro: si riporta all\'inizio della sessione', () => {
  assert.equal(clampToSession('2026-10-03T17:50:00.000Z', session), session.start_time);
});

test('orologio avanti: si riporta alla chiusura della sessione', () => {
  assert.equal(clampToSession('2026-10-04T00:10:00.000Z', session), session.end_time);
});

test('sessione ancora aperta: il limite è adesso', () => {
  const now = new Date('2026-10-03T20:00:00.000Z');
  assert.equal(clampToSession('2026-10-03T22:00:00.000Z', { start_time: session.start_time, end_time: null }, now), now.toISOString());
});
