-- ============================================
-- Il nome di un tipo di copia è unico per tenant, non in tutto il database
-- ============================================
-- Il vincolo copy_types_name_key valeva su tutte le righe: se un tenant aveva già la copia
-- "Cliente", nessun altro poteva crearla (la RLS nasconde le righe, ma non i vincoli di unicità).
BEGIN;
ALTER TABLE copy_types DROP CONSTRAINT IF EXISTS copy_types_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_copy_types_tenant_name ON copy_types (tenant_id, name);
COMMIT;
