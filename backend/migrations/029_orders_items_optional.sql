-- ============================================
-- orders.items non è più obbligatorio (prima di toglierlo)
-- ============================================
-- Le righe d'ordine vivono ora in order_items (migrazioni 027-028), che è l'unica fonte: il codice non scrive né
-- legge più il JSONB `orders.items`. La colonna va tolta in due tempi, perché in produzione database e codice non
-- cambiano nello stesso istante:
--   1. questa migrazione la rende facoltativa, PRIMA di avviare il codice nuovo (che inserisce ordini senza);
--   2. la migrazione 030 la elimina, DOPO che il codice nuovo è in funzione ovunque.
-- Il codice vecchio, dopo questa migrazione, continua a funzionare (scrive ancora items).
ALTER TABLE orders ALTER COLUMN items DROP NOT NULL;
