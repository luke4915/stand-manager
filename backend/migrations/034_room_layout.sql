-- ============================================
-- Pianta della sala (passo 2-6a)
-- ============================================
-- Ogni sala ha una griglia (grid_w × grid_h celle) e ogni tavolo una posizione e una misura in celle. Un tavolo
-- senza posizione (x, y, w, h nulli) non è ancora stato piazzato: è il caso dei tavoli creati prima di questa
-- migrazione o in serie. Niente rotazione: un tavolo lungo si ottiene scegliendo larghezza e altezza.
ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS grid_w INTEGER NOT NULL DEFAULT 24 CHECK (grid_w BETWEEN 4 AND 60),
  ADD COLUMN IF NOT EXISTS grid_h INTEGER NOT NULL DEFAULT 16 CHECK (grid_h BETWEEN 4 AND 60);

ALTER TABLE dining_tables
  ADD COLUMN IF NOT EXISTS x INTEGER CHECK (x >= 0),
  ADD COLUMN IF NOT EXISTS y INTEGER CHECK (y >= 0),
  ADD COLUMN IF NOT EXISTS w INTEGER CHECK (w BETWEEN 1 AND 30),
  ADD COLUMN IF NOT EXISTS h INTEGER CHECK (h BETWEEN 1 AND 30),
  ADD COLUMN IF NOT EXISTS shape TEXT NOT NULL DEFAULT 'rect' CHECK (shape IN ('rect', 'round'));

-- Posizione e misure vanno insieme: o ci sono tutte e quattro o nessuna.
ALTER TABLE dining_tables DROP CONSTRAINT IF EXISTS dining_tables_placement_complete;
ALTER TABLE dining_tables ADD CONSTRAINT dining_tables_placement_complete
  CHECK ((x IS NULL AND y IS NULL AND w IS NULL AND h IS NULL) OR (x IS NOT NULL AND y IS NOT NULL AND w IS NOT NULL AND h IS NOT NULL));
