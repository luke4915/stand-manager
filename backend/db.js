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

pool.on('error', (err) => {
  logger.error({ err }, 'Pool PostgreSQL: client inattivo in errore');
});

export default pool;
