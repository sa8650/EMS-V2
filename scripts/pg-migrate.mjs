#!/usr/bin/env node
/**
 * Apply db/postgres/migrations to a Supabase / PostgreSQL database.
 *
 *   DATABASE_URL=postgresql://postgres:…@db.<project>.supabase.co:5432/postgres npm run db:pg:migrate
 *   npm run db:pg:migrate -- --dry-run
 *
 * Use the *direct* (or session-pooler) connection string from Supabase →
 * Project Settings → Database. Each file runs in its own transaction and is
 * recorded in public._ems_migrations. All files are idempotent, so running
 * them against a database created from the legacy SQL is safe. Alternatively,
 * paste the files in order into the Supabase SQL editor.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { pgClientConfig } from './lib/pg-ssl.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dryRun = process.argv.includes('--dry-run');
const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
if (!url) {
  console.error('Set DATABASE_URL (Supabase → Project Settings → Database → connection string).');
  process.exit(2);
}

const dir = join(root, 'db', 'postgres', 'migrations');
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const { config, warning } = pgClientConfig(url, { caPath: process.env.PGSSLROOTCERT });
if (warning) console.warn(warning);
const client = new pg.Client(config);
try {
  await client.connect();
} catch (e) {
  console.error(`Could not connect to PostgreSQL: ${e.message}`);
  const code = String(e.code ?? '');
  if (['ENETUNREACH', 'ENOTFOUND', 'EHOSTUNREACH', 'ETIMEDOUT', 'ECONNREFUSED'].includes(code))
    console.error('Hint: Supabase "Direct connection" hosts (db.<project>.supabase.co) are IPv6-only. Use the "Session pooler" connection string from the Connect dialog instead.');
  else if (code === '28P01')
    console.error('Hint: wrong database password. Characters such as @ : / ? # must be URL-encoded inside the connection string (for example @ → %40).');
  else if (/certificate/i.test(e.message))
    console.error('Hint: set PGSSLROOTCERT to the CA certificate downloaded from Supabase → Project Settings → Database → SSL Configuration.');
  process.exit(1);
}
try {
  await client.query('create table if not exists public._ems_migrations (name text primary key, applied_at timestamptz not null default now())');
  await client.query('alter table public._ems_migrations enable row level security');
  const { rows } = await client.query('select name from public._ems_migrations');
  const applied = new Set(rows.map((r) => r.name));
  for (const name of files) {
    if (applied.has(name)) {
      console.info(`already-applied  ${name}`);
      continue;
    }
    if (dryRun) {
      console.info(`pending          ${name}`);
      continue;
    }
    const sql = readFileSync(join(dir, name), 'utf8');
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('insert into public._ems_migrations(name) values ($1)', [name]);
      await client.query('commit');
      console.info(`applied          ${name}`);
    } catch (e) {
      await client.query('rollback');
      throw new Error(`${name}: ${e.message}`);
    }
  }
  console.info(dryRun ? 'Dry run complete — nothing was changed.' : 'PostgreSQL database is up to date.');
} catch (e) {
  console.error('Migration failed (rolled back):', e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
