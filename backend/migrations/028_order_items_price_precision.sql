-- ============================================
-- Più decimali per il prezzo unitario delle righe d'ordine
-- ============================================
-- Il prezzo unitario di una riga è line_total / quantità (es. 3 × 1,6666…): con 4 decimali (migrazione 027) si
-- arrotondava rispetto al JSONB da cui proviene. Il riferimento in euro resta line_total (due decimali); il
-- prezzo unitario serve solo a mostrarlo, ma deve tornare uguale a quello salvato nell'ordine.
ALTER TABLE order_items ALTER COLUMN unit_price TYPE NUMERIC(16, 8);
