import { describe, expect, it } from 'vitest';
import { pgClientConfig } from '../../scripts/lib/pg-ssl.mjs';

const SUPA = 'postgresql://postgres.abcd:p%40ss@aws-0-ap-south-1.pooler.supabase.com:5432/postgres';

describe('pg-migrate TLS settings', () => {
  it('uses TLS without verification (and warns) for a remote host by default', () => {
    const r = pgClientConfig(SUPA);
    expect(r.config.ssl).toEqual({ rejectUnauthorized: false });
    expect(r.warning).toMatch(/PGSSLROOTCERT/);
    expect(r.config.connectionString).toBe(SUPA);
  });
  it('strips sslmode=require, which node-postgres would turn into public-CA verification', () => {
    const r = pgClientConfig(`${SUPA}?sslmode=require`);
    expect(r.config.connectionString).toBe(SUPA);
    expect(r.config.ssl).toEqual({ rejectUnauthorized: false });
  });
  it('verifies against a CA file when one is given', () => {
    const r = pgClientConfig(SUPA, { caPath: '/ca.crt', readFile: () => 'PEM' });
    expect(r.config.ssl).toEqual({ ca: 'PEM', rejectUnauthorized: true });
    expect(r.warning).toBeUndefined();
  });
  it('honours verify-full and disable; local hosts default to no TLS', () => {
    expect(pgClientConfig(`${SUPA}?sslmode=verify-full`).config.ssl).toEqual({ rejectUnauthorized: true });
    expect(pgClientConfig(`${SUPA}?sslmode=disable`).config.ssl).toBeUndefined();
    expect(pgClientConfig('postgresql://postgres:pw@127.0.0.1:5432/ems').config.ssl).toBeUndefined();
  });
});
