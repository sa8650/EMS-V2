import { QueryBuilder } from './query';
import type { TableName } from './schema';
import { assertIdent, DbError, type Database, type Filter, type QueryExecutor, type QuerySpec, type Row, type RpcName } from './types';

/**
 * Supabase adapter: talks to PostgREST with the service-role key. It must
 * only ever run on the server (the key bypasses row-level security, and EMS
 * enforces tenant isolation in its own service layer).
 */

interface PostgrestError {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
}

export function mapPostgrestError(status: number, body: PostgrestError | null, fallback: string): DbError {
  const code = body?.code;
  const message = body?.message || fallback;
  if (code === 'P0001') return new DbError(message, 400, code); // raise exception → business rule
  if (code === '23505') return new DbError(message, 409, code);
  if (code === '23503') return new DbError(message, 409, code);
  if (code === '23514' || code === '23502' || code === '22P02' || code === '22007') return new DbError(message, 400, code);
  if (code === '42703' || code === 'PGRST204') return new DbError(message, 400, '42703');
  if (code === 'PGRST116') return new DbError(message, 404, code);
  return new DbError(message, status >= 400 && status < 500 ? status : 500, code);
}

/**
 * Union of the keys of all rows. PostgREST needs one column list for a bulk
 * insert; with `missing=default`, keys absent from a row take the column default.
 */
function columnsOf(rows: Row[] | undefined): string {
  const keys = new Set<string>();
  for (const r of rows ?? []) for (const k of Object.keys(r)) if (r[k] !== undefined) keys.add(assertIdent(k, 'column'));
  return [...keys].join(',');
}

/** PostgREST reserved characters require quoting inside `in.(...)` lists. */
function quoteListValue(v: unknown): string {
  if (v === null) return 'null';
  const s = String(v);
  return /[,()".\\:\s]/.test(s) ? `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : s;
}

function encodeFilter(f: Filter): string {
  switch (f.op) {
    case 'eq': return f.value === null ? 'is.null' : `eq.${String(f.value)}`;
    case 'neq': return f.value === null ? 'not.is.null' : `neq.${String(f.value)}`;
    case 'is': return `is.${f.value === null ? 'null' : f.value ? 'true' : 'false'}`;
    case 'in': return `in.(${(f.value as unknown[]).map(quoteListValue).join(',')})`;
    default: return `${f.op}.${String(f.value)}`;
  }
}

export class SupabaseExecutor implements QueryExecutor {
  private readonly base: string;
  constructor(url: string, private readonly key: string, private readonly fetchImpl: typeof fetch = fetch) {
    this.base = url.replace(/\/+$/, '') + '/rest/v1';
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    const h: Record<string, string> = { apikey: this.key, Accept: 'application/json', ...extra };
    // Legacy service_role keys are JWTs and are also accepted as a bearer token.
    // The current `sb_secret_…` keys are not JWTs: Supabase only accepts them in `apikey`.
    if (!this.key.startsWith('sb_')) h.Authorization = `Bearer ${this.key}`;
    return h;
  }

  async request(path: string, init: { method: string; body?: unknown; prefer?: string }): Promise<unknown> {
    const headers = this.headers(init.body !== undefined ? { 'Content-Type': 'application/json' } : {});
    if (init.prefer) headers.Prefer = init.prefer;
    let res: Response;
    try {
      res = await this.fetchImpl(this.base + path, {
        method: init.method,
        headers,
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
        cache: 'no-store',
      });
    } catch (e) {
      throw new DbError(`Database unreachable: ${e instanceof Error ? e.message : String(e)}`, 503, 'unreachable');
    }
    const text = await res.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    if (!res.ok) throw mapPostgrestError(res.status, (data && typeof data === 'object' ? data : null) as PostgrestError | null, `Database request failed (${res.status})`);
    return data;
  }

  private query(spec: QuerySpec, includeShape: boolean): URLSearchParams {
    const q = new URLSearchParams();
    if (includeShape) q.set('select', spec.select || '*');
    for (const f of spec.filters) {
      if (f.op === 'search') {
        // The term is already reduced to letters/digits/space/@.+- by the query builder.
        q.append('or', `(${f.column.split(',').map((c) => `${c}.ilike."*${String(f.value)}*"`).join(',')})`);
      } else q.append(f.column, encodeFilter(f));
    }
    if (includeShape) {
      if (spec.order.length) q.set('order', spec.order.map((o) => `${o.column}.${o.ascending ? 'asc' : 'desc'}`).join(','));
      if (spec.limit !== undefined) q.set('limit', String(spec.limit));
      if (spec.offset !== undefined) q.set('offset', String(spec.offset));
    }
    return q;
  }

  /** Exact row count via `Prefer: count=exact` on a HEAD request (Content-Range: 0-9/42 or *\/42). */
  private async count(spec: QuerySpec): Promise<Row[]> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.base}/${spec.table}?${this.query(spec, false)}`, {
        method: 'HEAD',
        headers: { ...this.headers(), Prefer: 'count=exact' },
        cache: 'no-store',
      });
    } catch (e) {
      throw new DbError(`Database unreachable: ${e instanceof Error ? e.message : String(e)}`, 503, 'unreachable');
    }
    if (!res.ok) throw mapPostgrestError(res.status, null, `Database request failed (${res.status})`);
    const total = /\/(\d+)$/.exec(res.headers.get('content-range') ?? '')?.[1];
    return [{ count: Number(total ?? 0) }];
  }

  async execute(spec: QuerySpec): Promise<Row[]> {
    const path = `/${spec.table}`;
    let result: unknown;
    switch (spec.action) {
      case 'count':
        return this.count(spec);
      case 'select': {
        result = await this.request(`${path}?${this.query(spec, true)}`, { method: 'GET' });
        break;
      }
      case 'insert': {
        const q = new URLSearchParams({ select: spec.select || '*', columns: columnsOf(spec.values) });
        result = await this.request(`${path}?${q}`, { method: 'POST', body: spec.values ?? [], prefer: 'return=representation,missing=default' });
        break;
      }
      case 'upsert': {
        const q = new URLSearchParams({ select: spec.select || '*', columns: columnsOf(spec.values) });
        if (spec.onConflict?.length) q.set('on_conflict', spec.onConflict.join(','));
        result = await this.request(`${path}?${q}`, {
          method: 'POST',
          body: spec.values ?? [],
          prefer: 'resolution=merge-duplicates,return=representation,missing=default',
        });
        break;
      }
      case 'update': {
        const q = this.query(spec, false);
        q.set('select', spec.select || '*');
        result = await this.request(`${path}?${q}`, { method: 'PATCH', body: spec.patch ?? {}, prefer: 'return=representation' });
        break;
      }
      case 'delete': {
        const q = this.query(spec, false);
        q.set('select', spec.select || '*');
        result = await this.request(`${path}?${q}`, { method: 'DELETE', prefer: 'return=representation' });
        break;
      }
    }
    return Array.isArray(result) ? (result as Row[]) : result ? [result as Row] : [];
  }
}

export class SupabaseDatabase implements Database {
  readonly provider = 'supabase' as const;
  readonly executor: SupabaseExecutor;
  constructor(url: string, serviceRoleKey: string, fetchImpl?: typeof fetch) {
    this.executor = new SupabaseExecutor(url, serviceRoleKey, fetchImpl);
  }
  from<T extends TableName>(table: T): QueryBuilder<T> {
    return new QueryBuilder(this.executor, table);
  }
  async rpc<T = unknown>(name: RpcName, args: Row = {}): Promise<T> {
    return (await this.executor.request(`/rpc/${name}`, { method: 'POST', body: args })) as T;
  }
}
