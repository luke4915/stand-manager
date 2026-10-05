-- ============================================
-- Modificatori dei piatti (cottura, aggiunte, senza…)
-- ============================================
-- Un gruppo di modificatori («Cottura», «Aggiunte») ha delle opzioni, ciascuna con un supplemento di prezzo, e dice
-- quante se ne scelgono (`min_select` / `max_select`; max nullo = nessun limite). I gruppi si collegano ai prodotti.
-- Su una riga d'ordine le scelte si salvano come copia (`order_items.modifiers`: id, nome, supplemento): lo storico non
-- cambia se il gruppo viene modificato. Il prezzo di listino della riga è prezzo del prodotto + supplementi
-- (`original_price`), quindi sconti e omaggi restano nel calcolo di sempre (utils/pricing.js).
CREATE TABLE IF NOT EXISTS modifier_groups (
  id          SERIAL PRIMARY KEY,
  tenant_id   INTEGER NOT NULL DEFAULT NULLIF(current_setting('app.tenant_id', true), '')::int REFERENCES tenants(id),
  name        TEXT NOT NULL CHECK (length(btrim(name)) > 0),
  min_select  INTEGER NOT NULL DEFAULT 0 CHECK (min_select BETWEEN 0 AND 20),
  max_select  INTEGER CHECK (max_select BETWEEN 1 AND 20),
  position    INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT modifier_groups_min_max CHECK (max_select IS NULL OR max_select >= min_select)
);

CREATE TABLE IF NOT EXISTS modifiers (
  id           SERIAL PRIMARY KEY,
  tenant_id    INTEGER NOT NULL DEFAULT NULLIF(current_setting('app.tenant_id', true), '')::int REFERENCES tenants(id),
  group_id     INTEGER NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
  name         TEXT NOT NULL CHECK (length(btrim(name)) > 0),
  price_delta  NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (price_delta BETWEEN -1000 AND 1000),
  position     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS product_modifier_groups (
  tenant_id   INTEGER NOT NULL DEFAULT NULLIF(current_setting('app.tenant_id', true), '')::int REFERENCES tenants(id),
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  group_id    INTEGER NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, group_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_modifier_groups_tenant_name ON modifier_groups (tenant_id, lower(name));
CREATE INDEX IF NOT EXISTS idx_modifier_groups_tenant ON modifier_groups (tenant_id);
CREATE INDEX IF NOT EXISTS idx_modifiers_tenant ON modifiers (tenant_id);
CREATE INDEX IF NOT EXISTS idx_modifiers_group ON modifiers (group_id);
CREATE INDEX IF NOT EXISTS idx_pmg_tenant ON product_modifier_groups (tenant_id);
CREATE INDEX IF NOT EXISTS idx_pmg_group ON product_modifier_groups (group_id);

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['modifier_groups', 'modifiers', 'product_modifier_groups'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', tbl);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::int)', tbl);
  END LOOP;
END $$;

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS modifiers JSONB NOT NULL DEFAULT '[]'::jsonb;
