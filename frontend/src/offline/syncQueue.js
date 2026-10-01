import { db } from './db';
import { API_URL } from '../config/api';

export async function enqueueOrder(payload) {
  const localId = await db.pendingOrders.add({
    payload, status: 'pending', createdAt: Date.now(),
  });
  return localId;
}

export async function flushQueue() {
  const pending = await db.pendingOrders.where('status').equals('pending').toArray();
  for (const item of pending) {
    try {
      const res = await fetch(`${API_URL}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(item.payload),
      });
      if (!res.ok) throw new Error('sync fallita');
      await db.pendingOrders.delete(item.localId);
    } catch {
      break; // se una fallisce, le successive aspettano (mantiene l'ordine)
    }
  }
}

export async function pendingCount() {
  return db.pendingOrders.where('status').equals('pending').count();
}