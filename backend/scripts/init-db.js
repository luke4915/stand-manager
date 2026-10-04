// Prepara un database di produzione vuoto, una volta sola: crea i ruoli applicativo e master,
// carica schema.sql e registra tutte le migrazioni come già applicate (come `npm run db:baseline`).
// Se il database contiene già lo schema (tabella _migrations presente) non fa nulla, quindi si può
// eseguire a ogni rilascio prima di `npm run migrate` (vedi `npm run db:prepare` e railway.json).
//
// Usa MIGRATION_DATABASE_URL (utente privilegiato, con permesso di creare ruoli). I ruoli prendono
// nome e password da PG_USER/PG_PASSWORD e PG_MASTER_USER/PG_MASTER_PASSWORD; i nomi devono essere
// quelli di schema.sql (standmanager_app e standmanager_master).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';
import { prepareSchemaSql } from '../utils/migrationSql.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const ROLES = [
  { name: 'standmanager_app', userVar: 'PG_USER', passwordVar: 'PG_PASSWORD' },
  { name: 'standmanager_master', userVar: 'PG_MASTER_USER', passwordVar: 'PG_MASTER_PASSWORD' },
];

function fail(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}

async function run() {
  if (!process.env.MIGRATION_DATABASE_URL) fail('MIGRATION_DATABASE_URL non impostata');
  for (const role of ROLES) {
    if (process.env[role.userVar] !== role.name) fail(`${role.userVar} deve essere ${role.name} (il nome usato in schema.sql)`);
    if (!process.env[role.passwordVar]) fail(`${role.passwordVar} non impostata`);
  }

  const client = new pg.Client({ connectionString: process.env.MIGRATION_DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query("SELECT to_regclass('public._migrations') IS NOT NULL AS ready");
    if (rows[0].ready) {
      console.log('Database già inizializzato, nulla da fare.');
      return;
    }

    console.log('Database vuoto: creo ruoli e schema...');
    const schema = prepareSchemaSql(fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8'));
    const migrations = fs.readdirSync(path.join(__dirname, '..', 'migrations')).filter(f => f.endsWith('.sql')).sort();

    await client.query('BEGIN');
    try {
      for (const role of ROLES) {
        const password = client.escapeLiteral(process.env[role.passwordVar]);
        const { rowCount } = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role.name]);
        // Ruolo già presente (es. ripristino): si aggiorna solo la password, così combacia con l'env
        await client.query(rowCount
          ? `ALTER ROLE ${role.name} WITH LOGIN PASSWORD ${password}`
          : `CREATE ROLE ${role.name} LOGIN PASSWORD ${password}`);
      }
      await client.query(schema);
      // schema.sql azzera il search_path della sessione: da qui in poi nomi qualificati
      await client.query('INSERT INTO public._migrations (name) SELECT unnest($1::text[])', [migrations]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
    console.log(`✅ Schema caricato, ${migrations.length} migrazioni registrate come già applicate.`);
  } finally {
    await client.end();
  }
}

run().catch(err => fail(`Inizializzazione fallita: ${err.message}`));
