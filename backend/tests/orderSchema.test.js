import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOrderSchema } from '../schemas/orderSchema.js';

const items = [{ id: 1, name: 'Panino', quantity: 1 }];

test('device_id e device_seq vanno inviati insieme', () => {
  assert.equal(createOrderSchema.safeParse({ items, device_id: 1 }).success, false);
  assert.equal(createOrderSchema.safeParse({ items, device_seq: 3 }).success, false);
  assert.equal(createOrderSchema.safeParse({ items, device_id: 1, device_seq: 3 }).success, true);
  assert.equal(createOrderSchema.safeParse({ items }).success, true);
});

test('device_seq deve essere un intero positivo', () => {
  assert.equal(createOrderSchema.safeParse({ items, device_id: 1, device_seq: 0 }).success, false);
  assert.equal(createOrderSchema.safeParse({ items, device_id: 1, device_seq: 1.5 }).success, false);
});
