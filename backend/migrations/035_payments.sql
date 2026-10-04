-- ============================================
-- Pagamenti dei conti
-- ============================================
-- Una riga per ogni pagamento ricevuto su un conto (anche parziale, alla romana). Il metodo serve all'incasso atteso
-- in cassa: solo i contanti entrano nel cassetto (utils/revenue.js). L'API per registrarli arriva col passo 2-5;
-- qui la tabella, perché il passo 2-3 (incasso dei conti) ne ha bisogno per calcolare i contanti attesi.
CREATE TABLE IF NOT EXISTS payments (
  id        SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL DEFAULT NULLIF(current_setting('app.tenant_id', true), '')::int REFERENCES tenants(id),
  check_id  INTEGER NOT NULL REFERENCES checks(id),
  method    TEXT NOT NULL CHECK (method IN ('cash', 'card', 'other')),
  amount    NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  paid_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  paid_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_check ON payments (check_id);
CREATE INDEX IF NOT EXISTS idx_payments_tenant ON payments (tenant_id);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON payments;
CREATE POLICY tenant_isolation ON payments
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int);
