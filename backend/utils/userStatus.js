import { withTenantClient } from '../middleware/tenantScope.js';

// Stato attuale di un utente (esiste ancora? che ruolo ha? deve cambiare la password?), con una breve cache in memoria:
// il token dura 8 ore, ma un utente eliminato o cambiato di ruolo deve smettere di valere in fretta
// senza una query in più a ogni richiesta.
const TTL_MS = 15 * 1000;
const cache = new Map(); // `${tenantId}:${userId}` → { expires, value }

export async function getUserStatus(tenantId, userId) {
  const key = `${tenantId}:${userId}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;

  const value = await withTenantClient(tenantId, async (db) => {
    const { rows } = await db.query('SELECT role, must_change_password FROM users WHERE id = $1', [userId]);
    return rows[0] || null;
  });
  if (cache.size > 5000) cache.clear();
  cache.set(key, { expires: Date.now() + TTL_MS, value });
  return value;
}

// Dopo una modifica o un'eliminazione l'utente non deve restare "valido" per il tempo della cache.
export const invalidateUserStatus = (tenantId, userId) => cache.delete(`${tenantId}:${userId}`);

export const clearUserStatusCache = () => cache.clear();
