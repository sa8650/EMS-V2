import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { TABLES } from '@/server/db/schema';
import { SEED_ROWS } from '@/server/db/seeds';
import { freshD1, migrationFiles } from '../helpers/providers';

const expectedColumns = (t: string) => Object.keys(TABLES[t as keyof typeof TABLES]).sort();
const expectedGenerated = (t: string) =>
  Object.entries(TABLES[t as keyof typeof TABLES]).filter(([, v]) => v === 'gen').map(([k]) => k).sort();

describe('D1 migrations', () => {
  it('create exactly the tables and columns the app expects', () => {
    const { sqlite } = freshD1();
    const tables = (sqlite.prepare("select name from sqlite_master where type = 'table' and name not like 'sqlite_%' order by name").all() as { name: string }[]).map((r) => r.name);
    expect(tables).toEqual(Object.keys(TABLES).sort());
    for (const t of tables) {
      const info = sqlite.prepare(`PRAGMA table_xinfo("${t}")`).all() as { name: string; hidden: number }[];
      expect(info.map((c) => c.name).sort(), t).toEqual(expectedColumns(t));
      expect(info.filter((c) => c.hidden >= 2).map((c) => c.name).sort(), `${t} generated columns`).toEqual(expectedGenerated(t));
    }
  });

  it('seed only essential configuration', () => {
    const { sqlite } = freshD1();
    const settings = sqlite.prepare('select key, value from settings').all() as { key: string; value: string }[];
    expect(settings.map((s) => ({ key: s.key, value: JSON.parse(s.value) }))).toEqual(SEED_ROWS.settings);
    expect(sqlite.prepare('select key, title, enabled from addons order by key').all()).toEqual(
      [...SEED_ROWS.addons].sort((a, b) => a.key.localeCompare(b.key)).map((a) => ({ ...a, enabled: 0 })),
    );
    for (const t of Object.keys(TABLES).filter((t) => t !== 'settings' && t !== 'addons')) {
      expect((sqlite.prepare(`select count(*) as n from "${t}"`).get() as { n: number }).n, `${t} must start empty`).toBe(0);
    }
  });

  it('refuse to run on a database that already has EMS tables', () => {
    const { sqlite } = freshD1();
    expect(() => sqlite.exec(migrationFiles('d1')[0]!.sql)).toThrow(/already exists/);
  });
});

/**
 * Runs against a disposable PostgreSQL database that `npm run db:pg:migrate`
 * has just initialised:  EMS_TEST_DATABASE_URL=postgresql://…/ems_test
 */
describe.runIf(process.env.EMS_TEST_DATABASE_URL)('PostgreSQL migrations', () => {
  const withClient = async <T>(fn: (c: pg.Client) => Promise<T>): Promise<T> => {
    const c = new pg.Client({ connectionString: process.env.EMS_TEST_DATABASE_URL });
    await c.connect();
    try {
      return await fn(c);
    } finally {
      await c.end();
    }
  };

  it('create exactly the tables and columns the app expects', async () => {
    const cols = await withClient((c) =>
      c.query<{ table_name: string; column_name: string; is_generated: string }>(
        `select table_name, column_name, is_generated from information_schema.columns
          where table_schema = 'public' and table_name <> '_ems_migrations'`,
      ),
    );
    const byTable = new Map<string, { all: string[]; gen: string[] }>();
    for (const r of cols.rows) {
      const e = byTable.get(r.table_name) ?? { all: [], gen: [] };
      e.all.push(r.column_name);
      if (r.is_generated === 'ALWAYS') e.gen.push(r.column_name);
      byTable.set(r.table_name, e);
    }
    expect([...byTable.keys()].sort()).toEqual(Object.keys(TABLES).sort());
    for (const [t, e] of byTable) {
      expect(e.all.sort(), t).toEqual(expectedColumns(t));
      expect(e.gen.sort(), `${t} generated columns`).toEqual(expectedGenerated(t));
    }
  });

  it('enable row level security on every table, and factory reset restores only the essential configuration', async () => {
    const { rls, settings, addons } = await withClient(async (c) => ({
      reset: await c.query('select public.factory_reset()'),
      rls: (await c.query<{ n: string }>(`select count(*) as n from pg_tables where schemaname = 'public' and tablename <> '_ems_migrations' and not rowsecurity`)).rows[0]!.n,
      settings: (await c.query('select key, value from settings')).rows,
      addons: (await c.query('select key, title from addons order by key')).rows,
    }));
    expect(Number(rls)).toBe(0);
    expect(settings).toEqual(SEED_ROWS.settings);
    expect(addons).toEqual([...SEED_ROWS.addons].sort((a, b) => a.key.localeCompare(b.key)));
  });

  it('refuse to run on a database that already has EMS tables', async () => {
    await expect(
      withClient(async (c) => {
        await c.query('begin');
        try {
          await c.query(migrationFiles('postgres')[0]!.sql);
        } finally {
          await c.query('rollback');
        }
      }),
    ).rejects.toThrow(/already contains EMS tables/);
  });
});
