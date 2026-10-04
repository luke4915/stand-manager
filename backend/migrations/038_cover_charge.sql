-- ============================================
-- Coperto (passo 2-9)
-- ============================================
-- Il coperto è una riga del conto: una comanda automatica di tipo 'cover' con una sola riga "Coperto × coperti", già
-- servita, così totale, pagamento, incasso e statistiche lo trattano come ogni altra voce. Il prezzo per persona si fissa
-- all'apertura del conto (dall'impostazione `cover_charge`): cambiarlo dopo non tocca i conti già aperti.
ALTER TABLE checks ADD COLUMN IF NOT EXISTS cover_charge NUMERIC(8,2) NOT NULL DEFAULT 0 CHECK (cover_charge >= 0);

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_order_type_check;
ALTER TABLE orders ADD CONSTRAINT orders_order_type_check CHECK (order_type IN ('sale', 'gift', 'discount', 'cover'));
