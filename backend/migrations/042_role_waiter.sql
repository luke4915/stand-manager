-- ============================================
-- Ruolo cameriere (passo 3-5)
-- ============================================
-- Il cameriere prende gli ordini ai tavoli, manda le portate e serve; non incassa, non storna e non fa sconti.
-- Il vincolo sui ruoli accetta anche 'cameriere'.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'responsabile', 'cassa', 'cameriere', 'cucina'));
