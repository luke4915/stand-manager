import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Forza il puntamento alla radice del progetto (dove si trova il file .env)
dotenv.config({ path: path.resolve(__dirname, '.env') });

// Se è definita MIGRATION_DATABASE_URL usiamo quella (per le migrazioni DDL), 
// altrimenti usiamo le solite credenziali di app (PG_USER, ecc.)
const connectionConfig = process.env.MIGRATION_DATABASE_URL
  ? { connectionString: process.env.MIGRATION_DATABASE_URL }
  : {
      user: process.env.PG_USER,
      host: process.env.PG_HOST,
      database: process.env.PG_DATABASE,
      password: process.env.PG_PASSWORD,
      port: parseInt(process.env.PG_PORT) || 5432,
      max: 15,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    };

export const pool = new Pool(connectionConfig);

pool.on('error', (err) => {
  console.error('Pool PostgreSQL: client inattivo in errore', err.message);
});

export default pool;