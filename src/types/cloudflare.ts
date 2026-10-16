/**
 * Minimal structural types for the Cloudflare bindings EMS uses.
 * They match the runtime APIs of D1, R2 and Workers AI closely enough for
 * type-safety without pulling in @cloudflare/workers-types globals (which
 * conflict with the DOM lib used by the React side of the app).
 */

export interface D1Result<T = Record<string, unknown>> {
  results?: T[];
  success: boolean;
  error?: string;
  meta?: Record<string, unknown>;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  first<T = Record<string, unknown>>(column?: string): Promise<T | null>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<unknown>;
}

export interface R2ObjectBody {
  body: ReadableStream;
  size: number;
  httpEtag?: string;
  httpMetadata?: { contentType?: string; contentDisposition?: string };
  customMetadata?: Record<string, string>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface R2Object {
  key: string;
  size: number;
  uploaded?: Date;
  httpMetadata?: { contentType?: string };
}

export interface R2PutOptions {
  httpMetadata?: { contentType?: string; contentDisposition?: string };
  customMetadata?: Record<string, string>;
}

export interface R2Bucket {
  get(key: string): Promise<R2ObjectBody | null>;
  head(key: string): Promise<R2Object | null>;
  put(key: string, value: ArrayBuffer | ArrayBufferView | ReadableStream | string | Blob, options?: R2PutOptions): Promise<R2Object | null>;
  delete(key: string | string[]): Promise<void>;
}

export interface WorkersAi {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
}
