-- ============================================
-- Vincoli CHECK sui valori ammessi
-- ============================================
-- Stato degli ordini, ruolo degli utenti e destinazione di stampa erano testo libero: solo zod
-- impediva valori errati. Ora li vieta anche il database (uno script o un bug non scrivono più stati inventati).
-- NOT VALID + VALIDATE: i vincoli si applicano subito ai nuovi dati e poi si controllano quelli esistenti.
-- Ordine di rilascio: prima il codice (già conforme), poi questa migrazione.
BEGIN;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending', 'preparing', 'completed', 'canceled')) NOT VALID;
ALTER TABLE orders VALIDATE CONSTRAINT orders_status_check;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'responsabile', 'cassa', 'cucina')) NOT VALID;
ALTER TABLE users VALIDATE CONSTRAINT users_role_check;

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_print_destination_check;
ALTER TABLE products ADD CONSTRAINT products_print_destination_check
  CHECK (print_destination IN ('bar', 'kitchen', 'both')) NOT VALID;
ALTER TABLE products VALIDATE CONSTRAINT products_print_destination_check;
COMMIT;
