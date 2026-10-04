-- ============================================
-- Indici composti per elenco ordini e statistiche
-- ============================================
-- Le query filtrano per tenant (RLS) e sessione/stato o per data: gli indici a colonna singola
-- (idx_orders_tenant, idx_orders_session) non bastano quando gli ordini diventano decine di migliaia.
BEGIN;
CREATE INDEX IF NOT EXISTS idx_orders_tenant_session_status ON orders (tenant_id, session_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_tenant_created_at ON orders (tenant_id, created_at DESC);
-- gli indici singoli sono ora coperti dai composti (stesso prefisso)
DROP INDEX IF EXISTS idx_orders_tenant;
DROP INDEX IF EXISTS idx_orders_session;
COMMIT;
