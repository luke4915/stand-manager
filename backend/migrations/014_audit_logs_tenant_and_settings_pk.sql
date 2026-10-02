-- ============================================
-- audit_logs isolata per tenant + chiave primaria di settings per tenant
-- ============================================
BEGIN;

-- 1. audit_logs: tenant_id con backfill e RLS, come le altre tabelle tenant-scoped.
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);

-- Il backfill legge users, che ha FORCE ROW LEVEL SECURITY: senza app.tenant_id
-- impostato non vedrebbe nessuna riga. La forzatura si sospende solo dentro
-- questa transazione, così il proprietario della tabella legge tutti gli utenti.
ALTER TABLE users NO FORCE ROW LEVEL SECURITY;
UPDATE audit_logs a SET tenant_id = u.tenant_id
  FROM users u
  WHERE u.id = a.user_id AND a.tenant_id IS NULL;
ALTER TABLE users FORCE ROW LEVEL SECURITY;

-- Righe senza utente collegabile (utente eliminato o user_id vuoto): vanno al
-- tenant "default", da cui provengono tutti i dati storici.
UPDATE audit_logs SET tenant_id = (SELECT id FROM tenants WHERE slug = 'default')
  WHERE tenant_id IS NULL;

ALTER TABLE audit_logs ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE audit_logs ALTER COLUMN tenant_id SET DEFAULT NULLIF(current_setting('app.tenant_id', true), '')::int;
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON audit_logs (tenant_id);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON audit_logs;
CREATE POLICY tenant_isolation ON audit_logs
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int);

-- 2. settings: la chiave primaria era solo su "key" (la 007 aveva rimosso i
-- vincoli UNIQUE ma non la PRIMARY KEY), quindi due tenant non potevano avere
-- la stessa chiave. Diventa (tenant_id, key), che rende superflui il vincolo
-- UNIQUE composito e l'indice su tenant_id.
ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_pkey;
ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_tenant_key_unique;
ALTER TABLE settings ADD CONSTRAINT settings_pkey PRIMARY KEY (tenant_id, key);
DROP INDEX IF EXISTS idx_settings_tenant;

COMMIT;
