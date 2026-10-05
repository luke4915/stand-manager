import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fillHours, barPercent, peakHour, hourLabel, formatDuration } from './chartData.js';

const h = (hour, revenue, checks = 1) => ({ hour, revenue, checks, covers: checks * 2 });

test('le ore senza conti si riempiono a zero tra la prima e l\'ultima', () => {
  const filled = fillHours([h(21, 300), h(19, 120)]);
  assert.deepEqual(filled.map(x => [x.hour, x.revenue]), [[19, 120], [20, 0], [21, 300]]);
  assert.deepEqual(fillHours([]), []);
});

test('le barre sono in percentuale del massimo, con un minimo visibile', () => {
  assert.equal(barPercent(50, 200), 25);
  assert.equal(barPercent(200, 200), 100);
  assert.equal(barPercent(1, 1000), 2, 'mai invisibile se c\'è un valore');
  assert.equal(barPercent(0, 200), 0);
  assert.equal(barPercent(5, 0), 0);
});

test('l\'ora di punta è quella con più incasso; nessuna se non c\'è incasso', () => {
  assert.equal(peakHour([h(19, 120), h(20, 300), h(21, 300)]).hour, 20);
  assert.equal(peakHour([h(19, 0)]), null);
  assert.equal(peakHour([]), null);
});

test('formati', () => {
  assert.equal(hourLabel(9), '09:00');
  assert.equal(hourLabel(21), '21:00');
  assert.equal(formatDuration(45), '45 min');
  assert.equal(formatDuration(72), '1 h 12 min');
  assert.equal(formatDuration(60), '1 h 00 min');
  assert.equal(formatDuration(null), '—');
});
