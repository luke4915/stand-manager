import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toPublicOrder } from '../utils/publicOrder.js';

test('la vista pubblica non espone prezzi, totali né utente', () => {
  const order = toPublicOrder({
    id: 7, display_code: 'A7', status: 'pending', is_takeaway: true, created_at: '2026-01-01T20:00:00Z',
    total: 12, created_by: 3, session_id: 1,
    items: [{ id: 1, name: 'Panino', quantity: 2, price: 6, original_price: 6, type: 'sale', category: 'Cibo' }],
  });
  assert.deepEqual(order, {
    id: 7, display_code: 'A7', status: 'pending', is_takeaway: true, created_at: '2026-01-01T20:00:00Z',
    items: [{ id: 1, name: 'Panino', quantity: 2, note: '', category: 'Cibo' }],
  });
});
