-- ============================================
-- order_type: ammette anche 'discount'
-- ============================================
-- La 003 creava il vincolo (sale | gift | discount) solo se non esisteva già,
-- ma ne esisteva uno precedente con i soli 'sale' e 'gift': gli ordini con
-- sconto o misti (vendita + omaggio) venivano rifiutati dal database.
BEGIN;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_order_type_check;
ALTER TABLE orders ADD CONSTRAINT orders_order_type_check
  CHECK (order_type IN ('sale', 'gift', 'discount'));
COMMIT;
