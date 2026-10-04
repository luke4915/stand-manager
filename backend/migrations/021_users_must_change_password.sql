-- ============================================
-- Password iniziale temporanea con cambio obbligatorio al primo accesso
-- ============================================
-- Prima un utente senza password entrava con qualsiasi password. Ora ogni utente ha sempre una
-- password: chi lo crea (master o admin) ne imposta una temporanea e `must_change_password` obbliga
-- a cambiarla al primo accesso (il server blocca ogni altra chiamata finché non lo fa).
-- Gli utenti che oggi non hanno password restano senza accesso finché un admin non la reimposta
-- (POST /auth/admin/users/:id/reset-password).
-- Ordine di rilascio: prima questa migrazione, poi il nuovo codice.
BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
COMMIT;
