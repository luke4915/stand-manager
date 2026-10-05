-- ============================================
-- Muri e separatori nella pianta della sala
-- ============================================
-- Elementi che l'admin disegna sulla pianta tra i tavoli: muri (pieni) e separatori (paraventi, vetrate, piante).
-- Posizione e misura in celle, come i tavoli (034). Non hanno stato né conti: servono solo a leggere meglio la sala.
-- Le regole geometriche (dentro la sala, mai sopra un tavolo) le applica il server in utils/roomLayout.js.
CREATE TABLE IF NOT EXISTS room_elements (
  id         SERIAL PRIMARY KEY,
  tenant_id  INTEGER NOT NULL DEFAULT NULLIF(current_setting('app.tenant_id', true), '')::int REFERENCES tenants(id),
  room_id    INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL DEFAULT 'wall' CHECK (kind IN ('wall', 'divider')),
  x          INTEGER NOT NULL CHECK (x >= 0),
  y          INTEGER NOT NULL CHECK (y >= 0),
  w          INTEGER NOT NULL CHECK (w BETWEEN 1 AND 60),
  h          INTEGER NOT NULL CHECK (h BETWEEN 1 AND 60)
);

CREATE INDEX IF NOT EXISTS idx_room_elements_tenant ON room_elements (tenant_id);
CREATE INDEX IF NOT EXISTS idx_room_elements_room ON room_elements (room_id);

ALTER TABLE room_elements ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_elements FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON room_elements;
CREATE POLICY tenant_isolation ON room_elements
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int);
