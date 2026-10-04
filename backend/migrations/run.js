import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { appConnectionConfig } from '../db.js';
import { stripTransactionControl } from '../utils/migrationSql.js';

// Le DDL girano con l'utente privilegiato se MIGRATION_DATABASE_URL è impostata,
// altrimenti con l'utente applicativo. Questo pool esiste solo per le migrazioni.
const pool = new pg.Pool(
    process.env.MIGRATION_DATABASE_URL
        ? { connectionString: process.env.MIGRATION_DATABASE_URL }
        : appConnectionConfig
);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function run() {
    const client = await pool.connect();
    try {
        await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

        const { rows: applied } = await client.query('SELECT name FROM _migrations');
        const appliedNames = new Set(applied.map(r => r.name));

        const files = fs.readdirSync(__dirname)
            .filter(f => f.endsWith('.sql'))
            .sort(); // i nomi iniziano con 001_, 002_... l'ordine alfabetico = ordine numerico

        if (files.length === 0) {
            console.log('Nessun file di migration trovato.');
            return;
        }

        // --baseline: database appena creato da schema.sql, che contiene già tutte le
        // migrazioni presenti. Le registra come applicate senza eseguirle.
        if (process.argv.includes('--baseline')) {
            await client.query(
                'INSERT INTO _migrations (name) SELECT unnest($1::text[]) ON CONFLICT (name) DO NOTHING',
                [files]
            );
            console.log(`Baseline: ${files.length} migrazioni registrate come già applicate.`);
            return;
        }

        for (const file of files) {
            if (appliedNames.has(file)) {
                console.log(`⏭  ${file} già applicata, salto`);
                continue;
            }
            const sql = stripTransactionControl(fs.readFileSync(path.join(__dirname, file), 'utf8'));
            console.log(`▶  Applico ${file}...`);
            try {
                await client.query('BEGIN');
                await client.query(sql);
                await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
                await client.query('COMMIT');
                console.log(`✅ ${file} applicata`);
            } catch (err) {
                await client.query('ROLLBACK');
                console.error(`❌ Errore in ${file}:`, err.message);
                process.exit(1);
            }
        }

        console.log('Migrazioni completate.');
    } finally {
        client.release();
        await pool.end();
    }
}

run();