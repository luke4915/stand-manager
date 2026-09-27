
BEGIN;

-- Si assicura che la colonna esista
ALTER TABLE orders ADD COLUMN IF NOT EXISTS display_code VARCHAR(10);

-- Popolamento retroattivo raggruppando per sessione (o per data se non c'è sessione)
WITH orders_with_session AS (
  SELECT 
    o.id,
    o.tenant_id,
    COALESCE(s.id::text, o.created_at::date::text) AS session_group,
    o.created_at
  FROM orders o
  LEFT JOIN sessions s 
    ON s.tenant_id = o.tenant_id 
   AND o.created_at >= s.start_time 
   AND o.created_at <= COALESCE(s.end_time, NOW())
),
ranked_orders AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (
      PARTITION BY tenant_id, session_group 
      ORDER BY created_at ASC, id ASC
    ) - 1 AS order_rank
  FROM orders_with_session
)
UPDATE orders o
SET display_code = (
  CHR(65 + CAST(FLOOR(ro.order_rank::numeric / 100) AS INT) % 26) || 
  CAST((ro.order_rank % 100) + 1 AS TEXT)
)
FROM ranked_orders ro
WHERE o.id = ro.id;

COMMIT;