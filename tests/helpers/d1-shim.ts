import Database from 'better-sqlite3';
import type { D1Database, D1PreparedStatement, D1Result } from '@/types/cloudflare';

/**
 * Minimal Cloudflare D1 implementation on top of better-sqlite3 for tests.
 * Mirrors D1 semantics that matter to EMS: foreign keys enforced, `batch()`
 * runs atomically in one transaction, statements return `{ results }`.
 */
export function createD1(file = ':memory:'): D1Database & { sqlite: Database.Database } {
  const sqlite = new Database(file);
  sqlite.pragma('foreign_keys = ON');

  const exec = (sql: string, params: unknown[]): D1Result => {
    const stmt = sqlite.prepare(sql);
    if (stmt.reader) return { success: true, results: stmt.all(...(params as never[])) as Record<string, unknown>[] };
    const info = stmt.run(...(params as never[]));
    return { success: true, results: [], meta: { changes: info.changes, last_row_id: Number(info.lastInsertRowid) } };
  };

  const prepare = (sql: string, params: unknown[] = []): D1PreparedStatement & { _run(): D1Result } => ({
    bind: (...values: unknown[]) => prepare(sql, values),
    all: async <T>() => exec(sql, params) as D1Result<T>,
    run: async <T>() => exec(sql, params) as D1Result<T>,
    first: async <T>(column?: string) => {
      const row = (exec(sql, params).results ?? [])[0] as Record<string, unknown> | undefined;
      if (!row) return null;
      return (column ? row[column] : row) as T;
    },
    _run: () => exec(sql, params),
  });

  return {
    sqlite,
    prepare: (sql: string) => prepare(sql),
    batch: async <T>(statements: D1PreparedStatement[]) => {
      const run = sqlite.transaction(() => statements.map((s) => (s as unknown as { _run(): D1Result })._run()));
      return run() as D1Result<T>[];
    },
    exec: async (sql: string) => {
      sqlite.exec(sql);
      return { count: 1 };
    },
  };
}
