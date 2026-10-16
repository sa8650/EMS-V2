import type { D1Database, D1PreparedStatement } from '@/types/cloudflare';
import { parseSelect, QueryBuilder, type EmbedNode, type SelectNode } from './query';
import { booleanColumns, columnsOf, generatedColumns, jsonColumns, resolveRelation, type TableName } from './schema';
import { DbError, type Database, type Filter, type QueryExecutor, type QuerySpec, type Row, type RpcName } from './types';
import { d1Rpc } from './rpc-d1';

/**
 * Cloudflare D1 (SQLite) adapter: compiles QuerySpecs to parameterised SQL.
 * Booleans are stored as 0/1 and JSON as text; both are converted here using
 * the column types in ./schema, so callers see the same values as on Postgres.
 */

/** D1 allows at most 100 bound parameters per statement. */
const MAX_PARAMS = 90;

export function mapSqliteError(err: unknown): DbError {
  if (err instanceof DbError) return err;
  const message = err instanceof Error ? err.message : String(err);
  const detail = (re: RegExp) => message.replace(re, '').trim();
  if (/UNIQUE constraint failed/i.test(message)) return new DbError(`duplicate key value violates unique constraint (${detail(/^.*UNIQUE constraint failed:\s*/i)})`, 409, '23505');
  if (/FOREIGN KEY constraint failed/i.test(message)) return new DbError('violates foreign key constraint', 409, '23503');
  if (/CHECK constraint failed/i.test(message)) return new DbError(`violates check constraint (${detail(/^.*CHECK constraint failed:\s*/i)})`, 400, '23514');
  if (/NOT NULL constraint failed/i.test(message)) return new DbError(`null value violates not-null constraint (${detail(/^.*NOT NULL constraint failed:\s*/i)})`, 400, '23502');
  if (/no such column|has no column named/i.test(message)) return new DbError(message, 400, '42703');
  if (/no such table/i.test(message)) return new DbError(message, 500, '42P01');
  return new DbError(message, 500);
}

export class D1Executor implements QueryExecutor {
  constructor(readonly d1: D1Database) {}

  /* --------------------------- raw helpers --------------------------- */

  stmt(sql: string, params: unknown[] = []): D1PreparedStatement {
    const s = this.d1.prepare(sql);
    return params.length ? s.bind(...params.map(bindValue)) : s;
  }

  async all<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
    try {
      const r = await this.stmt(sql, params).all<T>();
      return r.results ?? [];
    } catch (e) {
      throw mapSqliteError(e);
    }
  }

  /** Runs statements atomically (a D1 batch is one transaction). */
  async batch(statements: D1PreparedStatement[]): Promise<Row[][]> {
    if (!statements.length) return [];
    try {
      const results = await this.d1.batch(statements);
      return results.map((r) => (r.results ?? []) as Row[]);
    } catch (e) {
      throw mapSqliteError(e);
    }
  }

  /* ----------------------------- codecs ------------------------------ */

  encodeRow(table: string, row: Row): Row {
    const cols = columnsOf(table);
    const out: Row = {};
    for (const [k, v] of Object.entries(row)) {
      if (v === undefined) continue;
      const type = cols[k];
      if (!type) throw new DbError(`column ${table}.${k} does not exist`, 400, '42703');
      if (type === 'gen') continue;
      if (v === null) out[k] = null;
      else if (type === 'bool') out[k] = v ? 1 : 0;
      else if (type === 'json') out[k] = JSON.stringify(v);
      else out[k] = v;
    }
    return out;
  }

  decodeRow(table: string, row: Row): Row {
    for (const k of booleanColumns(table)) if (k in row && row[k] !== null) row[k] = row[k] === 1 || row[k] === true || row[k] === '1';
    for (const k of jsonColumns(table)) {
      if (typeof row[k] === 'string') {
        try {
          row[k] = JSON.parse(row[k] as string);
        } catch {
          /* keep the raw text */
        }
      }
    }
    return row;
  }

  /* ----------------------------- WHERE ------------------------------- */

  where(table: string, filters: Filter[]): { sql: string; params: unknown[] } {
    if (!filters.length) return { sql: '', params: [] };
    const cols = columnsOf(table);
    const parts: string[] = [];
    const params: unknown[] = [];
    const known = (c: string) => {
      if (!cols[c]) throw new DbError(`column ${table}.${c} does not exist`, 400, '42703');
      return `"${c}"`;
    };
    const enc = (c: string, v: unknown) => (cols[c] === 'bool' && typeof v === 'boolean' ? (v ? 1 : 0) : v);
    for (const f of filters) {
      if (f.op === 'search') {
        const like = `%${String(f.value).replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
        const list = f.column.split(',').map(known);
        parts.push(`(${list.map((c) => `${c} LIKE ? ESCAPE '\\'`).join(' OR ')})`);
        params.push(...list.map(() => like));
        continue;
      }
      const col = known(f.column);
      switch (f.op) {
        case 'eq':
          if (f.value === null) parts.push(`${col} IS NULL`);
          else { parts.push(`${col} = ?`); params.push(enc(f.column, f.value)); }
          break;
        case 'neq':
          if (f.value === null) parts.push(`${col} IS NOT NULL`);
          else { parts.push(`${col} <> ?`); params.push(enc(f.column, f.value)); } // like PostgREST: NULL rows excluded
          break;
        case 'gt': parts.push(`${col} > ?`); params.push(f.value); break;
        case 'gte': parts.push(`${col} >= ?`); params.push(f.value); break;
        case 'lt': parts.push(`${col} < ?`); params.push(f.value); break;
        case 'lte': parts.push(`${col} <= ?`); params.push(f.value); break;
        case 'is':
          if (f.value === null) parts.push(`${col} IS NULL`);
          else parts.push(`${col} = ${f.value ? 1 : 0}`);
          break;
        case 'in': {
          const values = (f.value as unknown[]) ?? [];
          if (!values.length) parts.push('0');
          else { parts.push(`${col} IN (${values.map(() => '?').join(', ')})`); params.push(...values.map((v) => enc(f.column, v))); }
          break;
        }
      }
    }
    return { sql: ` WHERE ${parts.join(' AND ')}`, params };
  }

  /* ----------------------------- SELECT ------------------------------ */

  private async selectRows(table: string, node: SelectNode, spec: Pick<QuerySpec, 'filters' | 'order' | 'limit' | 'offset'>): Promise<Row[]> {
    const cols = columnsOf(table);
    const star = node.columns.includes('*');
    const wanted = new Set(star ? [] : node.columns);
    const extra = new Set<string>();
    for (const e of node.embeds) {
      const rel = resolveRelation(table, e.resource, e.hint);
      if (!rel) throw new DbError(`Could not find a relationship between '${table}' and '${e.resource}'`, 400, 'PGRST200');
      const key = rel.many ? 'id' : rel.fk;
      if (!star && !wanted.has(key)) extra.add(key);
    }
    for (const c of [...wanted, ...extra]) if (!cols[c]) throw new DbError(`column ${table}.${c} does not exist`, 400, '42703');
    const list = star ? '*' : [...wanted, ...extra].map((c) => `"${c}"`).join(', ') || '*';
    const w = this.where(table, spec.filters);
    let sql = `SELECT ${list} FROM "${table}"${w.sql}`;
    if (spec.order.length) {
      for (const o of spec.order) if (!cols[o.column]) throw new DbError(`column ${table}.${o.column} does not exist`, 400, '42703');
      sql += ' ORDER BY ' + spec.order.map((o) => `"${o.column}" ${o.ascending ? 'ASC NULLS LAST' : 'DESC NULLS FIRST'}`).join(', ');
    }
    const params = [...w.params];
    if (spec.limit !== undefined) { sql += ' LIMIT ?'; params.push(spec.limit); }
    else if (spec.offset !== undefined) sql += ' LIMIT -1';
    if (spec.offset !== undefined) { sql += ' OFFSET ?'; params.push(spec.offset); }

    let rows = params.length > MAX_PARAMS ? await this.selectChunkedIn(table, list, spec) : await this.all(sql, params);
    rows = rows.map((r) => this.decodeRow(table, r));
    if (node.embeds.length) rows = await this.attachEmbeds(table, rows, node.embeds);
    if (extra.size) for (const r of rows) for (const k of extra) delete r[k];
    return rows;
  }

  /** Splits one large IN (...) list into several statements (no limit/offset allowed). */
  private async selectChunkedIn(table: string, list: string, spec: Pick<QuerySpec, 'filters' | 'order' | 'limit' | 'offset'>): Promise<Row[]> {
    const big = spec.filters.find((f) => f.op === 'in' && Array.isArray(f.value) && f.value.length > MAX_PARAMS / 2);
    if (!big || spec.limit !== undefined || spec.offset !== undefined) throw new DbError('Too many query parameters for D1', 400);
    const rest = spec.filters.filter((f) => f !== big);
    const values = big.value as unknown[];
    const out: Row[] = [];
    for (let i = 0; i < values.length; i += MAX_PARAMS / 2) {
      const part = { ...big, value: values.slice(i, i + MAX_PARAMS / 2) } as Filter;
      const w = this.where(table, [...rest, part]);
      out.push(...(await this.all(`SELECT ${list} FROM "${table}"${w.sql}`, w.params)));
    }
    if (spec.order.length) {
      out.sort((a, b) => {
        for (const o of spec.order) {
          const c = compare(a[o.column], b[o.column], o.ascending);
          if (c) return c;
        }
        return 0;
      });
    }
    return out;
  }

  private async attachEmbeds(table: string, rows: Row[], embeds: EmbedNode[]): Promise<Row[]> {
    let result = rows;
    for (const e of embeds) {
      const rel = resolveRelation(table, e.resource, e.hint)!;
      if (rel.many) {
        const ids = [...new Set(result.map((r) => r.id).filter((v) => v != null))];
        const children = ids.length
          ? await this.selectRows(rel.table, withColumn(e, rel.fk), { filters: [{ column: rel.fk, op: 'in', value: ids as string[] }], order: [] })
          : [];
        const groups = new Map<unknown, Row[]>();
        for (const c of children) {
          const k = c[rel.fk];
          if (!groups.has(k)) groups.set(k, []);
          groups.get(k)!.push(c);
        }
        const strip = !e.columns.includes('*') && !e.columns.includes(rel.fk);
        for (const r of result) {
          const list = groups.get(r.id) ?? [];
          if (strip) for (const c of list) delete c[rel.fk];
          r[e.alias] = list;
        }
        if (e.inner) result = result.filter((r) => (r[e.alias] as Row[]).length > 0);
      } else {
        const ids = [...new Set(result.map((r) => r[rel.fk]).filter((v) => v != null))];
        const target = rel.table === 'addons' ? 'key' : 'id';
        const parents = ids.length
          ? await this.selectRows(rel.table, withColumn(e, target), { filters: [{ column: target, op: 'in', value: ids as string[] }], order: [] })
          : [];
        const byKey = new Map(parents.map((p) => [p[target], p]));
        const strip = !e.columns.includes('*') && !e.columns.includes(target);
        for (const r of result) {
          const p = byKey.get(r[rel.fk]);
          r[e.alias] = p ? (strip ? omit(p, target) : { ...p }) : null;
        }
        if (e.inner) result = result.filter((r) => r[e.alias] !== null);
      }
    }
    return result;
  }

  private async count(spec: QuerySpec): Promise<Row[]> {
    const w = this.where(spec.table, spec.filters);
    const rows = await this.all<{ count: number }>(`SELECT COUNT(*) AS count FROM "${spec.table}"${w.sql}`, w.params);
    return [{ count: Number(rows[0]?.count ?? 0) }];
  }

  /* ----------------------------- WRITES ------------------------------ */

  private async write(spec: QuerySpec): Promise<Row[]> {
    const { table } = spec;
    const node = parseSelect(spec.select);
    const generated = new Set(generatedColumns(table));
    if (spec.action === 'insert' || spec.action === 'upsert') {
      const statements: D1PreparedStatement[] = [];
      for (const raw of spec.values ?? []) {
        const row = this.encodeRow(table, raw);
        const cols = Object.keys(row);
        let sql = `INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`;
        if (spec.action === 'upsert') {
          const target = spec.onConflict ?? ['id'];
          const updatable = cols.filter((c) => !target.includes(c) && c !== 'id' && c !== 'created_at' && !generated.has(c));
          sql += ` ON CONFLICT(${target.map((c) => `"${c}"`).join(', ')}) ` +
            (updatable.length ? `DO UPDATE SET ${updatable.map((c) => `"${c}" = excluded."${c}"`).join(', ')}` : 'DO NOTHING');
        }
        statements.push(this.stmt(sql + ' RETURNING *', cols.map((c) => row[c])));
      }
      const results = await this.batch(statements);
      return this.project(table, node, results.flat().map((r) => this.decodeRow(table, r)));
    }
    const w = this.where(table, spec.filters);
    if (spec.action === 'update') {
      const patch = this.encodeRow(table, { ...spec.patch });
      const cols = Object.keys(patch);
      if (!cols.length) return this.selectRows(table, node, spec);
      const rows = await this.all(
        `UPDATE "${table}" SET ${cols.map((c) => `"${c}" = ?`).join(', ')}${w.sql} RETURNING *`,
        [...cols.map((c) => patch[c]), ...w.params],
      );
      return this.project(table, node, rows.map((r) => this.decodeRow(table, r)));
    }
    const rows = await this.all(`DELETE FROM "${table}"${w.sql} RETURNING *`, w.params);
    return this.project(table, node, rows.map((r) => this.decodeRow(table, r)));
  }

  private async project(table: string, node: SelectNode, rows: Row[]): Promise<Row[]> {
    let out = rows;
    if (node.embeds.length) out = await this.attachEmbeds(table, out, node.embeds);
    if (node.columns.includes('*')) return out;
    const keep = new Set([...node.columns, ...node.embeds.map((e) => e.alias)]);
    return out.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => keep.has(k))));
  }

  async execute(spec: QuerySpec): Promise<Row[]> {
    if (spec.action === 'select') return this.selectRows(spec.table, parseSelect(spec.select), spec);
    if (spec.action === 'count') return this.count(spec);
    return this.write(spec);
  }
}

export class D1DatabaseAdapter implements Database {
  readonly provider = 'd1' as const;
  readonly executor: D1Executor;

  constructor(d1: D1Database) {
    this.executor = new D1Executor(d1);
  }

  from<T extends TableName>(table: T): QueryBuilder<T> {
    return new QueryBuilder(this.executor, table);
  }

  rpc<T = unknown>(name: RpcName, args: Row = {}): Promise<T> {
    return d1Rpc(this, name, args) as Promise<T>;
  }
}

/* ------------------------------ utils -------------------------------- */

function bindValue(v: unknown): unknown {
  if (v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v instanceof Date) return v.toISOString();
  if (v !== null && typeof v === 'object') return JSON.stringify(v);
  return v;
}

function withColumn(node: EmbedNode, col: string): SelectNode {
  if (node.columns.includes('*') || node.columns.includes(col)) return node;
  return { ...node, columns: [...node.columns, col] };
}

function omit(row: Row, key: string): Row {
  const { [key]: _drop, ...rest } = row;
  return rest;
}

function compare(a: unknown, b: unknown, asc: boolean): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return asc ? 1 : -1;
  if (b === null || b === undefined) return asc ? -1 : 1;
  const r = (a as number | string) < (b as number | string) ? -1 : 1;
  return asc ? r : -r;
}
