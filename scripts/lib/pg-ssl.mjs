import { readFileSync } from 'node:fs';

const LOCAL_HOSTS = new Set(['', 'localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * node-postgres client settings for a connection string.
 *
 * Supabase requires TLS and signs its database certificates with its own CA, while
 * node-postgres treats `sslmode=require` as full verification against public CAs,
 * which fails with "self-signed certificate in certificate chain". So the TLS
 * settings are derived here instead of being left to the connection string:
 *  - PGSSLROOTCERT (or `sslrootcert=`) → TLS, certificate verified against that CA;
 *  - `sslmode=verify-full|verify-ca` without a CA file → verified against system CAs;
 *  - `sslmode=disable`, or a local host without TLS options → no TLS;
 *  - otherwise (remote host) → TLS without certificate verification, with a warning.
 *
 * @param {string} raw connection string
 * @param {{ caPath?: string, readFile?: (path: string) => string }} [opts]
 * @returns {{ config: import('pg').ClientConfig, warning?: string }}
 */
export function pgClientConfig(raw, opts = {}) {
  const u = new URL(raw);
  const mode = (u.searchParams.get('sslmode') ?? '').toLowerCase();
  const caPath = opts.caPath || u.searchParams.get('sslrootcert') || '';
  for (const key of ['sslmode', 'sslrootcert', 'uselibpqcompat']) u.searchParams.delete(key);
  const connectionString = u.toString();
  const read = opts.readFile ?? ((path) => readFileSync(path, 'utf8'));

  if (mode === 'disable' || (LOCAL_HOSTS.has(u.hostname) && !mode && !caPath)) return { config: { connectionString } };
  if (caPath) return { config: { connectionString, ssl: { ca: read(caPath), rejectUnauthorized: true } } };
  if (mode === 'verify-full' || mode === 'verify-ca') return { config: { connectionString, ssl: { rejectUnauthorized: true } } };
  return {
    config: { connectionString, ssl: { rejectUnauthorized: false } },
    warning:
      'TLS is on, but the server certificate is not verified. To verify it, download the CA certificate ' +
      '(Supabase → Project Settings → Database → SSL Configuration) and set PGSSLROOTCERT=/path/to/that.crt',
  };
}
