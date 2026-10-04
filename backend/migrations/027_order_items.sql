-- ============================================
-- Righe d'ordine in una tabella (affiancata al JSONB)
-- ============================================
-- Finora le righe di un ordine stavano solo nel JSONB `orders.items`. Per tavoli, portate e stato per riga serve una
-- tabella. Questa migrazione è solo additiva: `orders.items` resta la fonte di verità e nulla lo legge ancora da qui.
-- Il riempimento dei vecchi ordini e la doppia scrittura vengono dopo (scripts/order-items.js, routes/orders.js).
--
-- Rispecchia le righe così come sono nell'ordine. Niente stato per riga né portata: arrivano con la fase dei tavoli.
-- product_id non ha chiave esterna: un prodotto eliminato, o un id vecchio fuori catalogo, non deve bloccare lo storico.
-- I prezzi unitari possono avere più decimali (price = line_total / quantità): il riferimento resta line_total.
CREATE TABLE IF NOT EXISTS order_items (
  id               SERIAL PRIMARY KEY,
  tenant_id        INTEGER NOT NULL DEFAULT NULLIF(current_setting('app.tenant_id', true), '')::int REFERENCES tenants(id),
  order_id         INTEGER NOT NULL REFERENCES orders(id),
  position         INTEGER NOT NULL CHECK (position >= 0),
  product_id       BIGINT,
  name             TEXT NOT NULL,
  category         TEXT,
  print_destination TEXT CHECK (print_destination IN ('bar', 'kitchen', 'both')),
  quantity         INTEGER NOT NULL CHECK (quantity > 0),
  unit_price       NUMERIC(12, 4) NOT NULL,
  line_total       NUMERIC(12, 2) NOT NULL,
  original_price   NUMERIC(12, 4),
  line_type        TEXT NOT NULL DEFAULT 'sale' CHECK (line_type IN ('sale', 'gift', 'discount')),
  discount_mode    TEXT,
  discount_value   NUMERIC(12, 4),
  note             TEXT NOT NULL DEFAULT ''
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_order_items_order_position ON order_items (order_id, position);
CREATE INDEX IF NOT EXISTS idx_order_items_tenant ON order_items (tenant_id);
CREATE INDEX IF NOT EXISTS idx_order_items_tenant_product ON order_items (tenant_id, product_id);

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON order_items;
CREATE POLICY tenant_isolation ON order_items
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int);
