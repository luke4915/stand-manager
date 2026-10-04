-- Unione di due conti (passo 2-7): il conto assorbito resta in archivio, annullato, con il riferimento a quello in cui è confluito.
ALTER TABLE checks ADD COLUMN IF NOT EXISTS merged_into INTEGER REFERENCES checks(id);
