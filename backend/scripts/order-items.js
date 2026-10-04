// Riempimento e verifica di order_items dai vecchi ordini (orders.items).
//
//   node scripts/order-items.js analyze  [--tenant ID]            legge soltanto: righe e anomalie, anche prima della 027
//   node scripts/order-items.js backfill [--tenant ID] [--apply]  senza --apply è una prova e non scrive niente
//   node scripts/order-items.js verify   [--tenant ID]            confronta JSONB e tabella; esce con 1 se qualcosa non torna
//
// Usa MIGRATION_DATABASE_URL se c'è (utente privilegiato), altrimenti l'utente applicativo. Il riempimento si può
// ripetere: salta gli ordini che hanno già le righe.
import pg from 'pg';
import { appConnectionConfig } from '../db.js';
import { scanTenant, verifyTenant } from '../utils/orderItemsBackfill.js';

const [command, ...rest] = process.argv.slice(2);
const apply = rest.includes('--apply');
const tenantArg = rest.includes('--tenant') ? Number(rest[rest.indexOf('--tenant') + 1]) : null;

if (!['analyze', 'backfill', 'verify'].includes(command) || (rest.includes('--tenant') && !Number.isInteger(tenantArg))) {
  console.error('Uso: node scripts/order-items.js analyze|backfill|verify [--tenant ID] [--apply]');
  process.exit(2);
}

const pool = new pg.Pool(process.env.MIGRATION_DATABASE_URL ? { connectionString: process.env.MIGRATION_DATABASE_URL } : appConnectionConfig);

async function withTenant(id, fn) {
  const client = await pool.connect();
  try {
    await client.query('SELECT set_config($1, $2, false)', ['app.tenant_id', String(id)]);
    return await fn(client);
  } finally {
    try { await client.query('RESET app.tenant_id'); } catch { /* connessione già chiusa */ }
    client.release();
  }
}

const printAnomalies = (anomalies) => {
  const entries = Object.entries(anomalies);
  if (!entries.length) return console.log('   nessuna anomalia');
  for (const [type, { count, examples }] of entries) console.log(`   ${type}: ${count} (ordini di esempio: ${examples.join(', ')})`);
};

let failed = false;
try {
  const { rows: tenants } = await pool.query(
    tenantArg ? 'SELECT id, slug FROM tenants WHERE id = $1' : 'SELECT id, slug FROM tenants ORDER BY id', tenantArg ? [tenantArg] : []);
  if (!tenants.length) { console.error('Nessun tenant trovato.'); process.exit(2); }

  if (command === 'backfill' && !apply) console.log('PROVA: non viene scritto niente. Aggiungi --apply per scrivere.\n');

  for (const { id, slug } of tenants) {
    console.log(`▶ ${slug} (id ${id})`);
    if (command === 'verify') {
      const r = await withTenant(id, verifyTenant);
      console.log(`   ordini ${r.orders}, righe in tabella ${r.rows}`);
      console.log(`   righe mancanti ${r.counts.manca_riga}, in più ${r.counts.riga_in_piu}, con valori diversi ${r.counts.valori_diversi}`);
      console.log(`   attese (quantità non valida, senza riga per scelta): ${r.counts.attesa_quantita_non_valida}`);
      console.log(`   ordini il cui totale differisce dalla somma delle righe (informativo): ${r.total_differs}`);
      for (const [problem, list] of Object.entries(r.examples)) console.log(`   esempi ${problem}: ${list.map(e => `#${e.order_id}/${e.position}`).join(', ')}`);
      if (r.errors) failed = true;
    } else {
      const r = await withTenant(id, (db) => scanTenant(db, id, { apply: command === 'backfill' && apply, skipDone: command === 'backfill' }));
      const verb = command === 'backfill' && apply ? 'scritte' : 'da scrivere';
      console.log(`   ordini letti ${r.orders}, ordini con righe ${verb}: ${r.ordersToFill}, righe ${verb}: ${r.rows}, righe non rappresentabili: ${r.skippedRows}`);
      printAnomalies(r.anomalies);
    }
  }
  console.log(failed ? '\n✖ Differenze trovate.' : '\n✔ Fine.');
} catch (err) {
  console.error('Errore:', err.message);
  failed = true;
} finally {
  await pool.end();
}
process.exit(failed ? 1 : 0);
