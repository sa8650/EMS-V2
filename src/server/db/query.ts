import { columnsOf, uuidColumns, type RowOf, type TableName, type WriteOf } from './schema';
import { assertIdent, DbError, type Filter, type FilterOp, type QueryExecutor, type QuerySpec, type Row, type Scalar } from './types';

type Col<T extends TableName> = keyof RowOf<T> & string;

/**
 * Fluent, provider-agnostic query builder (a small subset of the supabase-js
 * API), typed by table. Awaiting the builder runs a SELECT; insert/update/
 * upsert/delete are terminal and resolve to the affected rows.
 *
 * Values are never interpolated into SQL or URLs: every value travels as data
 * in the QuerySpec and is bound/encoded by the adapter. Defaults that must be
 * identical on both providers are applied here: new UUIDs for `id`/token
 * columns on insert and `updated_at` on update.
 */
export class QueryBuilder<T extends TableName, R = RowOf<T>> implements PromiseLike<R[]> {
  private spec: QuerySpec;

  constructor(private readonly executor: QueryExecutor, table: T) {
    columnsOf(table);
    this.spec = { table: assertIdent(table, 'table'), action: 'select', select: '*', filters: [], order: [] };
  }

  /** Columns and embedded relations in PostgREST syntax, e.g. `id,name,customers(name)`. */
  select<S = RowOf<T>>(columns = '*'): QueryBuilder<T, S> {
    if (!/^[\w\s*,:!().]+$/.test(columns)) throw new DbError('Invalid select list', 400);
    const compact = columns.replace(/\s+/g, '');
    parseSelect(compact); // validates grammar + identifiers eagerly
    this.spec.select = compact;
    return this as unknown as QueryBuilder<T, S>;
  }

  private filter(column: string, op: FilterOp, value: Scalar | Scalar[]): this {
    this.spec.filters.push({ column: assertIdent(column, 'column'), op, value } satisfies Filter);
    return this;
  }

  eq(column: Col<T>, value: Scalar): this { return this.filter(column, 'eq', value); }
  neq(column: Col<T>, value: Scalar): this { return this.filter(column, 'neq', value); }
  gt(column: Col<T>, value: Scalar): this { return this.filter(column, 'gt', value); }
  gte(column: Col<T>, value: Scalar): this { return this.filter(column, 'gte', value); }
  lt(column: Col<T>, value: Scalar): this { return this.filter(column, 'lt', value); }
  lte(column: Col<T>, value: Scalar): this { return this.filter(column, 'lte', value); }
  /** `IS NULL` / `IS TRUE` / `IS FALSE`. */
  is(column: Col<T>, value: null | boolean): this { return this.filter(column, 'is', value); }
  in(column: Col<T>, values: readonly Scalar[]): this { return this.filter(column, 'in', [...values]); }

  /**
   * Case-insensitive "contains" across several text columns (OR). The term is
   * reduced to letters, digits and a few separators, so it is safe for both
   * SQL LIKE and PostgREST `ilike`. An empty term adds no filter.
   */
  search(columns: readonly Col<T>[], term: string | null | undefined): this {
    const clean = String(term ?? '').replace(/[^\p{L}\p{N} @.+\-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
    if (!clean || !columns.length) return this;
    for (const c of columns) assertIdent(c, 'column');
    this.spec.filters.push({ column: columns.join(','), op: 'search', value: clean });
    return this;
  }

  order(column: Col<T>, direction: 'asc' | 'desc' = 'asc'): this {
    this.spec.order.push({ column: assertIdent(column, 'column'), ascending: direction === 'asc' });
    return this;
  }

  limit(n: number): this {
    this.spec.limit = Math.max(0, Math.floor(Number(n) || 0));
    return this;
  }

  offset(n: number): this {
    this.spec.offset = Math.max(0, Math.floor(Number(n) || 0));
    return this;
  }

  /** Number of rows matching the filters (ignores order/limit/offset). */
  async count(): Promise<number> {
    const rows = await this.executor.execute({ ...this.spec, action: 'count', order: [], limit: undefined, offset: undefined });
    return Number(rows[0]?.count ?? 0);
  }

  /** Runs the SELECT and returns the first row or null. */
  async maybeSingle(): Promise<R | null> {
    if (this.spec.limit === undefined) this.spec.limit = 1;
    const rows = await this.run({ action: 'select' });
    return (rows[0] as R | undefined) ?? null;
  }

  /** Runs the SELECT and returns the first row, or throws a 404 DbError. */
  async single(message = 'Record not found.'): Promise<R> {
    const row = await this.maybeSingle();
    if (!row) throw new DbError(message, 404, 'not_found');
    return row;
  }

  insert(values: WriteOf<T> | WriteOf<T>[]): Promise<R[]> {
    const rows = (Array.isArray(values) ? values : [values]).map((v) => this.withInsertDefaults(v as Row));
    return this.run({ action: 'insert', values: rows }) as Promise<R[]>;
  }

  /** Insert one row and return it (throws if the database returned nothing). */
  async insertOne(values: WriteOf<T>): Promise<R> {
    const [row] = await this.insert(values);
    if (!row) throw new DbError('Insert returned no row.', 500);
    return row;
  }

  update(patch: WriteOf<T>): Promise<R[]> {
    if (!this.spec.filters.length) throw new DbError('Refusing to UPDATE without a filter', 500);
    const p: Row = { ...(patch as Row) };
    if ('updated_at' in columnsOf(this.spec.table) && p.updated_at === undefined) p.updated_at = new Date().toISOString();
    return this.run({ action: 'update', patch: p }) as Promise<R[]>;
  }

  upsert(values: WriteOf<T> | WriteOf<T>[], options: { onConflict: string }): Promise<R[]> {
    const onConflict = options.onConflict.split(',').map((c) => assertIdent(c.trim(), 'column'));
    const touch = 'updated_at' in columnsOf(this.spec.table);
    const rows = (Array.isArray(values) ? values : [values]).map((v) => {
      const row = this.withInsertDefaults(v as Row, onConflict);
      if (touch && row.updated_at === undefined) row.updated_at = new Date().toISOString();
      return row;
    });
    return this.run({ action: 'upsert', values: rows, onConflict }) as Promise<R[]>;
  }

  delete(): Promise<R[]> {
    if (!this.spec.filters.length) throw new DbError('Refusing to DELETE without a filter', 500);
    return this.run({ action: 'delete' }) as Promise<R[]>;
  }

  /** Exposes the compiled spec (used by tests). */
  toSpec(): QuerySpec {
    return structuredClone(this.spec);
  }

  /** New UUIDs for id/token columns (skipped for upsert conflict targets so an existing row is matched). */
  private withInsertDefaults(values: Row, conflictTarget: readonly string[] = []): Row {
    const row: Row = { ...values };
    for (const c of uuidColumns(this.spec.table)) {
      if (row[c] === undefined && !conflictTarget.includes(c)) row[c] = crypto.randomUUID();
    }
    return row;
  }

  private run(overrides: Partial<QuerySpec>): Promise<Row[]> {
    return this.executor.execute({ ...this.spec, ...overrides });
  }

  catch<X = never>(onrejected?: ((reason: unknown) => X | PromiseLike<X>) | null): Promise<R[] | X> {
    return this.then(undefined, onrejected);
  }

  finally(onfinally?: (() => void) | null): Promise<R[]> {
    return (this.run({ action: 'select' }) as Promise<R[]>).finally(onfinally);
  }

  then<R1 = R[], R2 = never>(
    onfulfilled?: ((value: R[]) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): Promise<R1 | R2> {
    return (this.run({ action: 'select' }) as Promise<R[]>).then(onfulfilled, onrejected);
  }
}

/* ------------------------------------------------------------------ */
/* PostgREST select-grammar parser (shared by the D1 adapter + tests)  */
/* ------------------------------------------------------------------ */

export interface SelectNode {
  /** Plain columns requested at this level (`*` allowed). */
  columns: string[];
  embeds: EmbedNode[];
}

export interface EmbedNode extends SelectNode {
  alias: string;
  resource: string;
  hint?: string;
  inner: boolean;
}

/** Parses `*,stores(name),items:invoice_lines(*,inventory_items(code))`. */
export function parseSelect(input: string): SelectNode {
  let i = 0;
  const s = input || '*';

  function parseList(): SelectNode {
    const node: SelectNode = { columns: [], embeds: [] };
    while (i < s.length && s[i] !== ')') {
      let token = '';
      while (i < s.length && !',()'.includes(s[i])) token += s[i++];
      if (s[i] === '(') {
        i++; // (
        const child = parseList();
        if (s[i] !== ')') throw new DbError('Unbalanced select list', 400);
        i++; // )
        let resource = token;
        let alias: string | undefined;
        const colon = token.indexOf(':');
        if (colon !== -1) {
          alias = token.slice(0, colon);
          resource = token.slice(colon + 1);
        }
        let hint: string | undefined;
        let inner = false;
        const bang = resource.indexOf('!');
        if (bang !== -1) {
          const mod = resource.slice(bang + 1);
          resource = resource.slice(0, bang);
          if (mod === 'inner') inner = true;
          else hint = mod;
        }
        alias ??= resource;
        node.embeds.push({ ...child, alias: assertIdent(alias), resource: assertIdent(resource), hint, inner });
      } else if (token) {
        node.columns.push(token === '*' ? '*' : assertIdent(token, 'column'));
      }
      if (s[i] === ',') i++;
    }
    return node;
  }

  const root = parseList();
  if (i !== s.length) throw new DbError('Unbalanced select list', 400);
  if (!root.columns.length && !root.embeds.length) root.columns.push('*');
  return root;
}
