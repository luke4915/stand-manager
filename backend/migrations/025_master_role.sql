-- ============================================
-- Ruolo separato per il pannello master
-- ============================================
-- Finora il master usava lo stesso utente applicativo dei tenant, che quindi poteva creare, modificare
-- ed eliminare tenant e cancellare il registro audit_logs: un bug o un'iniezione SQL in una route qualsiasi
-- avrebbe avuto questi poteri. Ora:
--  - standmanager_master: usato solo dalle route /master. Può scrivere su `tenants` e cancellare le righe
--    di un tenant (sempre dentro la RLS: serve app.tenant_id) per eliminarlo. Può leggere gli utenti di
--    tutti i tenant solo per contarli (policy in sola lettura).
--  - standmanager_app: su `tenants` solo SELECT; su audit_logs solo SELECT e INSERT.
-- Prima di questa migrazione va creato il ruolo (è a livello di cluster, con la sua password):
--   CREATE ROLE standmanager_master LOGIN PASSWORD '...';
-- e impostati PG_MASTER_USER e PG_MASTER_PASSWORD nel .env.
-- Ordine di rilascio: prima il ruolo, il .env e questa migrazione; poi il riavvio col codice nuovo (che usa il ruolo
-- master). Il codice vecchio, dopo la migrazione, non riuscirebbe più a scrivere sui tenant dal master.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'standmanager_master') THEN
    RAISE EXCEPTION 'Manca il ruolo standmanager_master: CREATE ROLE standmanager_master LOGIN PASSWORD ''...''; poi riesegui la migrazione';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'standmanager_app') THEN
    RAISE EXCEPTION 'Manca il ruolo standmanager_app';
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO standmanager_master;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO standmanager_master;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO standmanager_master;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO standmanager_master;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO standmanager_master;

-- elenco tenant con numero di utenti: lettura di tutti gli utenti, solo conteggio
DROP POLICY IF EXISTS master_read ON users;
CREATE POLICY master_read ON users FOR SELECT TO standmanager_master USING (true);

REVOKE INSERT, UPDATE, DELETE ON TABLE tenants FROM standmanager_app;
REVOKE DELETE ON TABLE audit_logs FROM standmanager_app;
