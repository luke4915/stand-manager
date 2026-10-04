// run.js esegue ogni migrazione dentro una sua transazione, insieme alla riga in _migrations.
// Molte migrazioni storiche contengono già "BEGIN;" e "COMMIT;": il loro COMMIT chiuderebbe
// la transazione di run.js a metà, e la registrazione in _migrations non sarebbe più atomica
// con la migrazione. Qui si tolgono solo le righe che contengono esattamente "BEGIN;" o
// "COMMIT;": il BEGIN dei blocchi DO $$ … $$ non ha il punto e virgola e resta com'è.
const TRANSACTION_LINE = /^[ \t]*(BEGIN|COMMIT)[ \t]*;[ \t]*(--[^\n]*)?$/gim;

export function stripTransactionControl(sql) {
  return sql.replace(TRANSACTION_LINE, '');
}
