// run.js esegue ogni migrazione dentro una sua transazione, insieme alla riga in _migrations.
// Molte migrazioni storiche contengono già "BEGIN;" e "COMMIT;": il loro COMMIT chiuderebbe
// la transazione di run.js a metà, e la registrazione in _migrations non sarebbe più atomica
// con la migrazione. Qui si tolgono solo le righe che contengono esattamente "BEGIN;" o
// "COMMIT;": il BEGIN dei blocchi DO $$ … $$ non ha il punto e virgola e resta com'è.
const TRANSACTION_LINE = /^[ \t]*(BEGIN|COMMIT)[ \t]*;[ \t]*(--[^\n]*)?$/gim;

export function stripTransactionControl(sql) {
  return sql.replace(TRANSACTION_LINE, '');
}

// schema.sql è un pg_dump fatto in locale: nomina come proprietario il ruolo di chi l'ha generato
// (che sul server di produzione non esiste), usa i comandi \restrict di psql e SET transaction_timeout
// (solo PostgreSQL 17+). Per caricarlo con un client normale (scripts/init-db.js) si tolgono queste
// righe: le tabelle restano dell'utente delle migrazioni, e i privilegi di default diventano i suoi.
const PSQL_META_LINE = /^\\(un)?restrict\b[^\n]*$/gm;
const OWNER_LINE = /^ALTER [A-Z ]+ .+ OWNER TO [^;\n]+;[ \t]*$/gm;
const TRANSACTION_TIMEOUT_LINE = /^SET transaction_timeout = [^;\n]+;[ \t]*$/gm;
const DEFAULT_PRIVILEGES_FOR_ROLE = /^(ALTER DEFAULT PRIVILEGES) FOR ROLE \S+ /gm;

export function prepareSchemaSql(sql) {
  return sql
    .replace(PSQL_META_LINE, '')
    .replace(OWNER_LINE, '')
    .replace(TRANSACTION_TIMEOUT_LINE, '')
    .replace(DEFAULT_PRIVILEGES_FOR_ROLE, '$1 ');
}
