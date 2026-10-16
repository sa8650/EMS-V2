import 'server-only';
import { getEnv, type AppEnv } from '@/server/env';
import { D1DatabaseAdapter } from './d1';
import { SCHEMA_MARKER } from './seeds';
import { SupabaseDatabase } from './supabase';
import { DbError, type Database } from './types';

export type { Database, Row, RpcName } from './types';
export type { RowOf, TableName, WriteOf } from './schema';
export { DbError } from './types';

const adapters = new WeakMap<object, Database>();
const verified = new WeakSet<Database>();

/** The adapter for the configured provider (chosen in src/server/env.ts). */
export function createDb(env: AppEnv): Database {
  const key = (env.provider === 'd1' ? env.DB : env) as object;
  const hit = adapters.get(key);
  if (hit) return hit;
  const db: Database =
    env.provider === 'd1' ? new D1DatabaseAdapter(env.DB!) : new SupabaseDatabase(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!);
  adapters.set(key, db);
  return db;
}

/**
 * Confirms the configured database was initialised with the EMS 5 migrations
 * (the `schema` marker row) before the app reads or writes anything, so a wrong
 * or legacy database is reported instead of being modified.
 */
export async function assertEmsDatabase(db: Database): Promise<void> {
  if (verified.has(db)) return;
  let marker: unknown;
  try {
    marker = (await db.from('settings').select('value').eq('key', 'schema').maybeSingle())?.value;
  } catch (e) {
    const missing = e instanceof DbError && (e.code === '42P01' || e.code === 'PGRST205' || e.status === 404);
    throw new DbError(
      missing
        ? 'The database has not been initialised. Run the EMS migrations (see docs/DATABASE.md).'
        : `The database could not be reached: ${e instanceof Error ? e.message : String(e)}`,
      503,
      'db_not_ready',
    );
  }
  const m = (marker ?? {}) as { product?: string; version?: number };
  if (m.product !== SCHEMA_MARKER.product || Number(m.version) < SCHEMA_MARKER.version) {
    throw new DbError('The configured database is not an EMS 5 database. Point the app at the database created for EMS 5 (see docs/DATABASE.md).', 503, 'db_not_ready');
  }
  verified.add(db);
}

/** The verified database for the current request. */
export async function getDb(): Promise<Database> {
  const db = createDb(await getEnv());
  await assertEmsDatabase(db);
  return db;
}
