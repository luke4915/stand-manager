-- ============================================
-- Portate (passo 3-1/3-2): ordine di uscita dei piatti
-- ============================================
-- Il locale ha una lista di portate ordinate (antipasto, primo, secondo, dolce…) e ogni prodotto può averne una.
-- Il cameriere prende tutto il giro in una volta: il server crea una comanda per portata. Quelle che escono subito
-- nascono `pending`, le altre `scheduled` («da mandare»): sono salvate sul conto ma non arrivano in cucina finché
-- qualcuno non le manda. `course_seq` è l'ordine di uscita (stesso numero = escono insieme), `fired_at` quando
-- sono state mandate.
CREATE TABLE IF NOT EXISTS courses (
  id         SERIAL PRIMARY KEY,
  tenant_id  INTEGER NOT NULL DEFAULT NULLIF(current_setting('app.tenant_id', true), '')::int REFERENCES tenants(id),
  name       TEXT NOT NULL CHECK (length(btrim(name)) > 0),
  position   INTEGER NOT NULL DEFAULT 0,
  active     BOOLEAN NOT NULL DEFAULT true
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_courses_tenant_name ON courses (tenant_id, lower(name));
CREATE INDEX IF NOT EXISTS idx_courses_tenant ON courses (tenant_id);

ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON courses;
CREATE POLICY tenant_isolation ON courses
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int);

-- Nessuna chiave esterna con effetto sullo storico: se una portata sparisce il prodotto resta senza portata.
ALTER TABLE products ADD COLUMN IF NOT EXISTS course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS course_seq INTEGER CHECK (course_seq >= 1),
  ADD COLUMN IF NOT EXISTS course_name TEXT,
  ADD COLUMN IF NOT EXISTS fired_at TIMESTAMPTZ;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('scheduled', 'pending', 'preparing', 'completed', 'canceled'));

-- Una portata da mandare esiste solo su un conto e ha il suo ordine di uscita.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_scheduled_on_check;
ALTER TABLE orders ADD CONSTRAINT orders_scheduled_on_check
  CHECK (status <> 'scheduled' OR (check_id IS NOT NULL AND course_seq IS NOT NULL));
