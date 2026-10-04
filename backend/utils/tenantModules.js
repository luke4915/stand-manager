import { pool } from '../db.js';
import logger from '../logger.js';

// Moduli accesi per un tenant, con una breve cache in memoria (come userStatus): il master li cambia di rado,
// ma una modifica deve valere subito sul processo che la riceve (invalidateTenantModules) e in pochi secondi altrove.
const TTL_MS = 15 * 1000;
const cache = new Map(); // tenantId → { expires, value }

export async function getTenantModules(tenantId) {
  const hit = cache.get(tenantId);
  if (hit && hit.expires > Date.now()) return hit.value;

  const { rows } = await pool.query('SELECT business_type, modules FROM tenants WHERE id = $1', [tenantId]);
  const value = rows[0] ? { businessType: rows[0].business_type, modules: rows[0].modules } : null;
  if (cache.size > 1000) cache.clear();
  cache.set(tenantId, { expires: Date.now() + TTL_MS, value });
  return value;
}

export const invalidateTenantModules = (tenantId) => cache.delete(Number(tenantId));
export const clearTenantModulesCache = () => cache.clear();

// Blocca la route se il tenant non ha il modulo. Il tenant arriva dal token (route autenticate) o dal
// sottodominio (route pubbliche): mai dal client. Va messo dopo authenticate / resolveTenantFromHost.
export const requireModule = (moduleId) => async (req, res, next) => {
  const tenantId = req.user?.tenantId ?? req.tenantId;
  if (!tenantId) return res.status(403).json({ error: 'Tenant mancante' });
  try {
    const tenant = await getTenantModules(tenantId);
    if (!tenant?.modules.includes(moduleId))
      return res.status(403).json({ error: 'Funzione non attiva per questo locale', code: 'MODULE_DISABLED' });
    next();
  } catch (err) {
    logger.error({ err, moduleId }, 'Errore verifica modulo');
    res.status(500).json({ error: 'Errore interno' });
  }
};
