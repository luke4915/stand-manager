-- ============================================
-- Username unico per tenant; il login cerca l'utente nel tenant del sottodominio
-- ============================================
-- Prima l'username era unico in tutto il database perché il login cercava l'utente senza
-- conoscere il tenant. Ora il tenant arriva dal sottodominio, quindi:
--  - due tenant possono avere lo stesso username (es. "admin");
--  - la deroga della RLS per il login (app.allow_login_lookup) non serve più e si toglie:
--    la tabella users torna isolata come tutte le altre.
-- Ordine di rilascio: prima il nuovo codice (funziona anche con la vecchia policy), poi questa migrazione.
BEGIN;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_key;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_users_tenant_username ON users (tenant_id, username);

DROP POLICY IF EXISTS tenant_isolation ON users;
CREATE POLICY tenant_isolation ON users
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int);
COMMIT;
