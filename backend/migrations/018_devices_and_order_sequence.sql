-- ============================================
-- Dispositivi (casse) e numerazione ordini per dispositivo
-- ============================================
-- Ogni cassa ha una lettera (A, B, …) assegnata una volta sola all'abbinamento e un
-- contatore proprio per sessione, tenuto dal client: così il codice ordine si compone
-- e si stampa anche senza rete. Il server non lo genera: ricostruisce lettera + numero
-- e il vincolo di unicità impedisce che due ordini abbiano lo stesso codice.
BEGIN;

CREATE TABLE IF NOT EXISTS devices (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL DEFAULT NULLIF(current_setting('app.tenant_id', true), '')::int REFERENCES tenants(id),
  letter CHAR(1) NOT NULL CHECK (letter ~ '^[A-Z]$'),
  name VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, letter)
);
CREATE INDEX IF NOT EXISTS idx_devices_tenant ON devices (tenant_id);

ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON devices;
CREATE POLICY tenant_isolation ON devices
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int);

-- Gli ordini esistenti restano senza dispositivo (codice generato dal vecchio contatore di sessione).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS device_id INTEGER REFERENCES devices(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS device_seq INTEGER CHECK (device_seq > 0);
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_device_pair_check;
ALTER TABLE orders ADD CONSTRAINT orders_device_pair_check CHECK ((device_id IS NULL) = (device_seq IS NULL));

CREATE UNIQUE INDEX IF NOT EXISTS uniq_orders_device_seq
  ON orders (tenant_id, session_id, device_id, device_seq) WHERE device_id IS NOT NULL;

COMMIT;
