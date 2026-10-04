-- ============================================
-- Sale e tavoli (modulo `tables`)
-- ============================================
-- Prima tappa della sala dei ristoranti (docs/design-tavoli.md): le sale e i tavoli di ogni locale.
-- Solo struttura: i conti (checks) e i pagamenti arrivano con la migrazione successiva. La mappa della sala
-- (posizione dei tavoli) e l'ordine delle sale si aggiungeranno quando ci sarà l'interfaccia che li usa.
-- La tabella dei tavoli si chiama dining_tables per non confondersi con i "tables" di PostgreSQL.
CREATE TABLE IF NOT EXISTS rooms (
  id         SERIAL PRIMARY KEY,
  tenant_id  INTEGER NOT NULL DEFAULT NULLIF(current_setting('app.tenant_id', true), '')::int REFERENCES tenants(id),
  name       TEXT NOT NULL CHECK (length(btrim(name)) > 0),
  active     BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS dining_tables (
  id         SERIAL PRIMARY KEY,
  tenant_id  INTEGER NOT NULL DEFAULT NULLIF(current_setting('app.tenant_id', true), '')::int REFERENCES tenants(id),
  room_id    INTEGER NOT NULL REFERENCES rooms(id),
  name       TEXT NOT NULL CHECK (length(btrim(name)) > 0),
  seats      INTEGER NOT NULL DEFAULT 2 CHECK (seats BETWEEN 1 AND 99),
  active     BOOLEAN NOT NULL DEFAULT true
);

-- Nomi unici senza distinguere maiuscole: "Sala" e "sala" sono la stessa sala; "T1" e "t1" lo stesso tavolo.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_rooms_tenant_name ON rooms (tenant_id, lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS uniq_dining_tables_room_name ON dining_tables (room_id, lower(name));
CREATE INDEX IF NOT EXISTS idx_dining_tables_tenant ON dining_tables (tenant_id);

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['rooms', 'dining_tables'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', tbl);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::int)', tbl);
  END LOOP;
END $$;
