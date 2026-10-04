import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';
import logger from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Forza il puntamento alla radice del progetto (dove si trova il file .env)
dotenv.config({ path: path.resolve(__dirname, '.env') });

// Credenziali dell'utente applicativo, soggetto a RLS.
// MIGRATION_DATABASE_URL (utente privilegiato per le DDL) NON va mai usata qui:
// l'app girerebbe con un utente che può scavalcare la RLS. La usa solo migrations/run.js.
export const appConnectionConfig = {
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: parseInt(process.env.PG_PORT) || 5432,
};

export const pool = new Pool({
  ...appConnectionConfig,
  max: 15,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Pool del pannello master: un altro utente del database, usato solo dalle route /master (vedi migrazione 025).
// Può scrivere su `tenants` ed eliminare un tenant; l'utente applicativo no.
export const masterPool = new Pool({
  user: process.env.PG_MASTER_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_MASTER_PASSWORD,
  port: parseInt(process.env.PG_PORT) || 5432,
  max: 3,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  logger.error({ err }, 'Pool PostgreSQL: client inattivo in errore');
});

masterPool.on('error', (err) => {
  logger.error({ err }, 'Pool master PostgreSQL: client inattivo in errore');
});

export default pool;

// Esegue fn dentro BEGIN/COMMIT sulla stessa connessione; ROLLBACK e rilancio su errore.
// Per uscire con un errore "di business" (es. 409) lancia un HttpError da utils/httpError.js.
export async function inTransaction(client, fn) {
  await client.query('BEGIN');
  try {
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}
