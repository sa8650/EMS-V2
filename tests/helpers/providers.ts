import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { D1DatabaseAdapter } from '@/server/db/d1';
import { SupabaseDatabase } from '@/server/db/supabase';
import type { Database } from '@/server/db/types';
import { createD1 } from './d1-shim';

const root = fileURLToPath(new URL('../../', import.meta.url));

export function migrationFiles(provider: 'd1' | 'postgres'): { name: string; sql: string }[] {
  const dir = join(root, 'db', provider, 'migrations');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(dir, name), 'utf8') }));
}

/** A fresh in-memory D1 database with every migration applied. */
export function freshD1() {
  const d1 = createD1();
  for (const f of migrationFiles('d1')) d1.sqlite.exec(f.sql);
  return d1;
}

export interface ProviderCase {
  name: 'd1' | 'supabase';
  make(): Promise<Database>;
}

/**
 * D1 always runs (in-process SQLite). PostgreSQL runs when a *local* PostgREST
 * in front of a migrated, disposable database is configured:
 *   EMS_TEST_SUPABASE_URL=http://127.0.0.1:3333 EMS_TEST_SUPABASE_KEY=<service-role JWT>
 * Each case starts with factory_reset(), so only local URLs are accepted.
 */
export function providerCases(): ProviderCase[] {
  const cases: ProviderCase[] = [{ name: 'd1', make: async () => new D1DatabaseAdapter(freshD1()) }];
  const url = process.env.EMS_TEST_SUPABASE_URL;
  const key = process.env.EMS_TEST_SUPABASE_KEY;
  if (url && key) {
    const host = new URL(url).hostname;
    if (host !== '127.0.0.1' && host !== 'localhost') throw new Error('EMS_TEST_SUPABASE_URL must point to a local, disposable PostgREST.');
    // Plain PostgREST serves at "/", Supabase behind "/rest/v1".
    const local: typeof fetch = (input, init) => fetch(String(input).replace('/rest/v1', ''), init);
    cases.push({
      name: 'supabase',
      make: async () => {
        const db = new SupabaseDatabase(url, key, local);
        await db.rpc('factory_reset');
        return db;
      },
    });
  }
  return cases;
}
