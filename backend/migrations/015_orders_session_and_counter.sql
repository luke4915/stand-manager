-- ============================================
-- Ordini legati alla sessione + contatore atomico per display_code
-- ============================================
BEGIN;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS session_id INTEGER REFERENCES sessions(id);
CREATE INDEX IF NOT EXISTS idx_orders_session ON orders (session_id);

-- Progressivo degli ordini nella sessione: incrementato con UPDATE … RETURNING
-- dentro la transazione dell'ordine, quindi due casse non ottengono mai lo stesso codice.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS order_counter INTEGER NOT NULL DEFAULT 0;

-- Al massimo una sessione aperta per tenant: rende sicure le aperture concorrenti
-- e garantisce che "la sessione attiva" sia sempre una sola.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_sessions_open_per_tenant ON sessions (tenant_id) WHERE end_time IS NULL;

-- Backfill: orders e sessions hanno FORCE ROW LEVEL SECURITY, che senza
-- app.tenant_id nasconderebbe tutte le righe. La forzatura si sospende solo
-- dentro questa transazione.
ALTER TABLE orders NO FORCE ROW LEVEL SECURITY;
ALTER TABLE sessions NO FORCE ROW LEVEL SECURITY;

-- Gli ordini esistenti si assegnano alla sessione del loro tenant aperta in quel momento.
UPDATE orders o SET session_id = s.id
  FROM sessions s
  WHERE o.session_id IS NULL
    AND s.tenant_id = o.tenant_id
    AND o.created_at >= s.start_time
    AND o.created_at <= COALESCE(s.end_time, now());

UPDATE sessions s SET order_counter = c.n
  FROM (SELECT session_id, COUNT(*)::int AS n FROM orders WHERE session_id IS NOT NULL GROUP BY session_id) c
  WHERE c.session_id = s.id;

ALTER TABLE orders FORCE ROW LEVEL SECURITY;
ALTER TABLE sessions FORCE ROW LEVEL SECURITY;

COMMIT;
