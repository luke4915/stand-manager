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
    id: 7, display_code: 'A7', status: 'pending', is_takeaway: true, created_at: '2026-01-01T20:00:00Z', table_name: null, covers: null,
    items: [{ id: 1, name: 'Panino', quantity: 2, note: '', category: 'Cibo' }],
  });
});

test('una comanda di un tavolo mostra tavolo e coperti, mai importi', () => {
  const order = toPublicOrder({
    id: 8, display_code: '3', status: 'pending', created_at: '2026-01-01T20:00:00Z', total: 40, check_id: 5, check_number: 2,
    table_name: 'T5', covers: 4, items: [],
  });
  assert.equal(order.table_name, 'T5');
  assert.equal(order.covers, 4);
  assert.equal('total' in order, false);
  assert.equal('check_id' in order, false);
});
