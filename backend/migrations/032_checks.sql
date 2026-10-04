-- ============================================
-- Conti dei tavoli
-- ============================================
-- Un conto raccoglie le comande (ordini) di un tavolo e si paga alla fine (docs/design-tavoli.md).
-- Un ordine con `check_id` nullo è un ordine pagato subito, come per le sagre: nulla cambia per loro.
-- Qui solo il conto e il legame con gli ordini; i pagamenti arrivano con la migrazione successiva.
-- Il totale del conto non si memorizza: lo calcola il server dagli ordini non annullati.
CREATE TABLE IF NOT EXISTS checks (
  id                SERIAL PRIMARY KEY,
  tenant_id         INTEGER NOT NULL DEFAULT NULLIF(current_setting('app.tenant_id', true), '')::int REFERENCES tenants(id),
  session_id        INTEGER NOT NULL REFERENCES sessions(id),
  table_id          INTEGER REFERENCES dining_tables(id),   -- nullo per un conto al banco
  number            INTEGER NOT NULL CHECK (number > 0),    -- progressivo nella sessione
  covers            INTEGER NOT NULL DEFAULT 0 CHECK (covers BETWEEN 0 AND 99),
  status            TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'paid', 'void')),
  opened_by         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  opened_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  bill_requested_at TIMESTAMPTZ,
  closed_at         TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_checks_session_number ON checks (session_id, number);
-- Un solo conto aperto per tavolo: due camerieri che aprono lo stesso tavolo insieme non ne creano due.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_checks_open_table ON checks (table_id) WHERE status = 'open' AND table_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_checks_tenant_status ON checks (tenant_id, status);

ALTER TABLE checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE checks FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON checks;
CREATE POLICY tenant_isolation ON checks
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS check_id INTEGER REFERENCES checks(id);
CREATE INDEX IF NOT EXISTS idx_orders_check ON orders (check_id) WHERE check_id IS NOT NULL;
