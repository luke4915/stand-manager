import { pool } from '../db.js';
import logger from '../logger.js';

// Va usato SEMPRE dopo `authenticate` (serve req.user.tenantId).
// Acquisisce una connessione dedicata dal pool (non condivisa con altre
// richieste finché non viene rilasciata) e vi imposta app.tenant_id a
// livello di sessione: le policy RLS su ogni tabella la useranno per
// filtrare automaticamente le righe di quel tenant.
//
// Ogni route deve usare `req.db.query(...)` al posto di `pool.query(...)`.
// Non usare mai `pool.query` direttamente su tabelle tenant-scoped: quella
// query girerebbe su una connessione qualsiasi del pool, senza garanzia che
// app.tenant_id sia impostato correttamente (o addirittura con un tenant_id
// "sporco" lasciato da una richiesta precedente).
export async function tenantScope(req, res, next) {
  if (!req.user?.tenantId) {
    return res.status(403).json({ error: 'Tenant mancante nel token' });
  }

  // Licenza scaduta: blocca qui, prima di aprire la connessione scoped.
  // Query leggera su `tenants` (non RLS-protetta, non serve app.tenant_id).
  try {
    const { rows } = await pool.query('SELECT expires_at, active FROM tenants WHERE id = $1', [req.user.tenantId]);
    const tenant = rows[0];
    if (!tenant?.active) {
      return res.status(403).json({ error: 'Tenant disattivato', code: 'TENANT_INACTIVE' });
    }
    if (tenant.expires_at && new Date(tenant.expires_at) < new Date()) {
      return res.status(402).json({ error: 'Licenza scaduta', code: 'LICENSE_EXPIRED' });
    }
  } catch (err) {
    logger.error({ err }, 'Errore verifica scadenza licenza');
    return res.status(500).json({ error: 'Errore interno' });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('SELECT set_config($1, $2, false)', ['app.tenant_id', String(req.user.tenantId)]);
  } catch (err) {
    client?.release();
    logger.error({ err }, 'Errore impostazione tenant scope');
    return res.status(500).json({ error: 'Errore interno' });
  }

  req.db = client;
  let released = false;

  const releaseClient = async () => {
    if (released) return;
    released = true;
    try {
      // Pulizia difensiva: azzera il tenant prima di restituire la
      // connessione al pool, così un eventuale uso scorretto futuro
      // (pool.query diretto) non eredita mai un tenant_id stantio.
      await client.query('RESET app.tenant_id');
    } catch {
      // connessione probabilmente già chiusa/rotta, nulla da fare
    } finally {
      client.release();
    }
  };

  res.on('finish', releaseClient);
  res.on('close', releaseClient);

  next();
}

// Per lavori asincroni "fire-and-forget" che sopravvivono alla risposta HTTP
// (es. stampa in background dopo aver già risposto al client): non si può
// usare req.db, perché a quel punto è già stato rilasciato al pool. Questa
// funzione acquisisce/scopa/rilascia una connessione dedicata autonomamente.
export async function withTenantClient(tenantId, fn) {
  const client = await pool.connect();
  try {
    await client.query('SELECT set_config($1, $2, false)', ['app.tenant_id', String(tenantId)]);
    return await fn(client);
  } finally {
    try { await client.query('RESET app.tenant_id'); } catch { /* connessione probabilmente già chiusa */ }
    client.release();
  }
}

// Usata SOLO dal login: cerca l'utente per username senza ancora conoscere
// il tenant (che è proprio quello che dobbiamo scoprire). Sfrutta la policy
// dedicata su `users` che si apre quando app.allow_login_lookup='true'.
export async function lookupUserForLogin(username) {
  const client = await pool.connect();
  try {
    await client.query("SELECT set_config('app.allow_login_lookup', 'true', false)");
    const { rows } = await client.query('SELECT * FROM users WHERE username = $1', [username]);
    return rows[0] || null;
  } finally {
    try { await client.query("RESET app.allow_login_lookup"); } catch { /* connessione probabilmente già chiusa */ }
    client.release();
  }
}
