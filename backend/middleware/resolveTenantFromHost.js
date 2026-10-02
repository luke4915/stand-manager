import { pool } from '../db.js';
import logger from '../logger.js';

// Cache slug → tenantId con scadenza: evita una query a ogni richiesta pubblica,
// ma le modifiche dal master panel (slug, attivazione) diventano visibili entro il TTL.
// I tenant "non trovati" non si memorizzano, così un tenant appena creato
// risponde subito anche se qualcuno aveva già provato quel sottodominio.
const SLUG_CACHE_TTL_MS = 60 * 1000;
const slugCache = new Map(); // slug → { tenantId, active, expiresAt }

export function extractSlug(hostname) {
  const parts = hostname.split('.');
  if (parts.length < 3) return null;
  const slug = parts[0];
  return slug === 'www' ? null : slug;
}

// Ritorna { tenantId, active } oppure null se lo slug non esiste.
export async function findTenantBySlug(slug) {
  const cached = slugCache.get(slug);
  if (cached && cached.expiresAt > Date.now()) return cached;

  const { rows } = await pool.query('SELECT id, active FROM tenants WHERE slug = $1', [slug]);
  if (!rows.length) {
    slugCache.delete(slug);
    return null;
  }
  const tenant = { tenantId: rows[0].id, active: rows[0].active, expiresAt: Date.now() + SLUG_CACHE_TTL_MS };
  slugCache.set(slug, tenant);
  return tenant;
}

export async function resolveTenantFromHost(req, res, next) {
  const slug = extractSlug(req.hostname);
  if (!slug) {
    return res.status(404).json({ error: 'Tenant non specificato nel dominio' });
  }

  try {
    const tenant = await findTenantBySlug(slug);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant non trovato' });
    }
    if (!tenant.active) {
      return res.status(403).json({ error: "Account disattivato. Contatta l'assistenza.", code: 'TENANT_INACTIVE' });
    }
    req.tenantId = tenant.tenantId;
    next();
  } catch (err) {
    logger.error({ err }, 'Errore risoluzione tenant da sottodominio');
    res.status(500).json({ error: 'Errore interno' });
  }
}