import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { stripTransactionControl, prepareSchemaSql } from '../utils/migrationSql.js';

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

test('toglie BEGIN; e COMMIT; di primo livello', () => {
  const sql = 'BEGIN;\nALTER TABLE x ADD COLUMN y INT;\nCOMMIT;\n';
  assert.equal(stripTransactionControl(sql).trim(), 'ALTER TABLE x ADD COLUMN y INT;');
});

test('tollera minuscole, spazi e commenti in coda', () => {
  const sql = '  begin;  -- apre\nSELECT 1;\ncommit ;\n';
  assert.equal(stripTransactionControl(sql).trim(), 'SELECT 1;');
});

test('lascia il BEGIN dei blocchi DO $$', () => {
  const sql = 'DO $$\nBEGIN\n  PERFORM 1;\nEND $$;';
  assert.equal(stripTransactionControl(sql), sql);
});

test('nessuna migrazione resta con un controllo di transazione proprio', () => {
  for (const file of fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql'))) {
    const sql = stripTransactionControl(fs.readFileSync(path.join(migrationsDir, file), 'utf8'));
    assert.doesNotMatch(sql, /^\s*(BEGIN|COMMIT|ROLLBACK|START TRANSACTION)\s*;/im, file);
  }
});

test('schema.sql preparato per un server nuovo: niente proprietario locale né comandi psql', () => {
  const sql = prepareSchemaSql(fs.readFileSync(path.join(migrationsDir, '..', 'schema.sql'), 'utf8'));
  assert.doesNotMatch(sql, /^\\/m);
  assert.doesNotMatch(sql, /OWNER TO/);
  assert.doesNotMatch(sql, /FOR ROLE/);
  assert.doesNotMatch(sql, /transaction_timeout/);
  assert.match(sql, /ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT,INSERT,DELETE,UPDATE ON TABLES TO standmanager_app;/);
  assert.match(sql, /CREATE TABLE public\.tenants/);
});
