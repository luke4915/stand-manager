-- ============================================
-- Moduli e tipo di attività per tenant
-- ============================================
-- Una sola piattaforma per attività diverse (sagra, paninaro, ristorante): ogni tenant ha un tipo di attività
-- e un elenco di moduli accesi. Il tipo è solo un preset dei moduli (vedi utils/modules.js), non cambia il codice.
-- Migrazione additiva: i tenant esistenti ricevono i moduli che usano oggi (KDS, statistiche, menu QR), quindi
-- per loro non cambia nulla. `tenants` non ha RLS: la scrive solo il ruolo master (migrazione 025).
-- L'elenco dei moduli validi sta nel codice, non in un CHECK, così un modulo nuovo non richiede una migrazione.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS business_type text NOT NULL DEFAULT 'sagra';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS modules text[] NOT NULL DEFAULT ARRAY['kds', 'stats', 'qr_menu']::text[];

ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_business_type_check;
ALTER TABLE tenants ADD CONSTRAINT tenants_business_type_check CHECK (business_type IN ('sagra', 'paninaro', 'ristorante'));
