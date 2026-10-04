-- ============================================
-- Permessi minimi per l'utente applicativo
-- ============================================
-- standmanager_app aveva ALL su ogni tabella: TRUNCATE ignora la RLS (svuota i dati di tutti i
-- tenant in un colpo), TRIGGER e REFERENCES non servono all'app, e il registro audit_logs si poteva
-- modificare. Restano SELECT/INSERT/UPDATE/DELETE; su audit_logs non si aggiorna più.
-- Resta DELETE su audit_logs: serve all'eliminazione di un tenant dal master (con la RLS ogni
-- tenant tocca solo le sue righe). Un ruolo separato per il master è una fase successiva.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'standmanager_app') THEN
    REVOKE TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public FROM standmanager_app;
    REVOKE UPDATE ON TABLE audit_logs FROM standmanager_app;
    -- MAINTAIN (vacuum, analyze, reindex...) esiste solo da PostgreSQL 17
    IF current_setting('server_version_num')::int >= 170000 THEN
      EXECUTE 'REVOKE MAINTAIN ON ALL TABLES IN SCHEMA public FROM standmanager_app';
      EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE MAINTAIN ON TABLES FROM standmanager_app';
    END IF;
    -- le tabelle create in futuro dall'utente che esegue le migrazioni partono già senza questi permessi
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM standmanager_app;
  END IF;
END $$;
