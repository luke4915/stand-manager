-- ============================================
-- Idempotenza degli ordini: chiave generata dal client
-- ============================================
-- La cassa genera un UUID per ogni ordine e lo reinvia identico a ogni tentativo
-- (rete instabile, coda offline): il vincolo di unicità impedisce i doppioni.
BEGIN;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS client_order_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_orders_client_order_id
  ON orders (tenant_id, client_order_id) WHERE client_order_id IS NOT NULL;
COMMIT;
