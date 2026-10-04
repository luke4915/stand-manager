-- ============================================
-- Pagamento per voce (conti separati)
-- ============================================
-- Un pagamento può saldare delle righe d'ordine precise (o parte della loro quantità): è il modo di fare i conti
-- separati al tavolo ("io pago il primo e la birra"). Un pagamento senza righe è un pagamento a importo
-- (alla romana, acconto). `amount` è la quota di quella riga pagata, calcolata dal server: l'ultima quota di una
-- riga prende il resto, così le quote sommano esattamente il totale di riga.
CREATE TABLE IF NOT EXISTS payment_items (
  id            SERIAL PRIMARY KEY,
  tenant_id     INTEGER NOT NULL DEFAULT NULLIF(current_setting('app.tenant_id', true), '')::int REFERENCES tenants(id),
  payment_id    INTEGER NOT NULL REFERENCES payments(id),
  order_item_id INTEGER NOT NULL REFERENCES order_items(id),
  quantity      INTEGER NOT NULL CHECK (quantity > 0),
  amount        NUMERIC(12,2) NOT NULL CHECK (amount >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_payment_items_payment_item ON payment_items (payment_id, order_item_id);
CREATE INDEX IF NOT EXISTS idx_payment_items_order_item ON payment_items (order_item_id);
CREATE INDEX IF NOT EXISTS idx_payment_items_tenant ON payment_items (tenant_id);

ALTER TABLE payment_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON payment_items;
CREATE POLICY tenant_isolation ON payment_items
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int);
