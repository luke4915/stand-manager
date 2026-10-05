-- ============================================
-- Stato per riga (passo 3-3): in preparazione, pronta, servita
-- ============================================
-- Ogni riga di una comanda ha il suo stato: cucina e bar la fanno avanzare (preparing → ready), il cameriere la serve
-- (served). Lo stato della comanda (`orders.status`) si ricava dalle righe: tutte pronte = completed, almeno una in
-- preparazione o pronta = preparing, altrimenti pending (utils/lineStatus.js). Le sagre non lo usano: lavorano a comanda.
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS prep_status TEXT NOT NULL DEFAULT 'new' CHECK (prep_status IN ('new', 'preparing', 'ready', 'served')),
  ADD COLUMN IF NOT EXISTS ready_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS served_at TIMESTAMPTZ;

-- Le comande già avanzate: completata = righe pronte, in preparazione = righe in preparazione.
UPDATE order_items oi SET prep_status = 'ready', ready_at = COALESCE(o.completed_at, now())
FROM orders o WHERE o.id = oi.order_id AND o.status = 'completed' AND oi.prep_status = 'new';
UPDATE order_items oi SET prep_status = 'preparing'
FROM orders o WHERE o.id = oi.order_id AND o.status = 'preparing' AND oi.prep_status = 'new';

-- Le righe pronte da servire di un conto aperto si contano spesso (mappa della sala).
CREATE INDEX IF NOT EXISTS idx_order_items_ready ON order_items (order_id) WHERE prep_status = 'ready';
