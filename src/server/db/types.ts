/**
 * Provider-independent database contract.
 *
 * Both adapters (Supabase/PostgreSQL via PostgREST, Cloudflare D1/SQLite)
 * implement `Database`. Business code only ever talks to this interface.
 */

import type { TableName } from './schema';

export type Scalar = string | number | boolean | null;
export type Row = Record<string, unknown>;

export type FilterOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'is' | 'in' | 'search';

export interface Filter {
  /** One column; for `search` a comma-separated list of columns. */
  column: string;
  op: FilterOp;
  value: Scalar | Scalar[];
}

export interface OrderBy {
  column: string;
  ascending: boolean;
}

export type QueryAction = 'select' | 'count' | 'insert' | 'update' | 'upsert' | 'delete';

export interface QuerySpec {
  table: string;
  action: QueryAction;
  /** PostgREST select grammar, e.g. `*,customers(name),invoice_lines(*,products(code))`. */
  select: string;
  filters: Filter[];
  order: OrderBy[];
  limit?: number;
  offset?: number;
  values?: Row[];
  patch?: Row;
  onConflict?: string[];
}

export interface QueryExecutor {
  execute(spec: QuerySpec): Promise<Row[]>;
}

/** Atomic operations implemented in SQL (Postgres) and emulated with D1 batches. */
export type RpcName = 'next_counter' | 'post_invoice' | 'delete_invoice' | 'factory_reset';

export interface Database {
  readonly provider: 'd1' | 'supabase';
  from<T extends TableName>(table: T): import('./query').QueryBuilder<T>;
  rpc<T = unknown>(name: RpcName, args?: Row): Promise<T>;
}

/** Error raised by adapters. `status` follows HTTP semantics (400 invalid, 404 missing, 409 conflict). */
export class DbError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(message: string, status = 500, code?: string) {
    super(message);
    this.name = 'DbError';
    this.status = status;
    this.code = code;
  }
}

const IDENT = /^[a-z_][a-z0-9_]*$/;

/** Guards every identifier that reaches SQL or a PostgREST URL. */
export function assertIdent(name: string, kind = 'identifier'): string {
  if (!IDENT.test(name)) throw new DbError(`Invalid ${kind}: ${name}`, 400, 'invalid_identifier');
  return name;
}
