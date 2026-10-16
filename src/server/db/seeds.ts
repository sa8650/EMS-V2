/**
 * Essential configuration rows, identical to db/postgres/migrations/0003_seed.sql
 * and db/d1/migrations/0002_seed.sql (checked by tests). Used by the D1 factory
 * reset; on Postgres, factory_reset() calls seed_defaults().
 */
export const SCHEMA_MARKER = { product: 'ems', version: 5 } as const;

export const SEED_ROWS = {
  settings: [{ key: 'schema', value: SCHEMA_MARKER }],
  addons: [
    { key: 'connectx', title: 'ConnectX' },
    { key: 'zudo', title: 'Zudo AI' },
    { key: 'business_health', title: 'AI Business Health' },
    { key: 'truebill', title: 'TrueBill' },
    { key: 'vaultium', title: 'Vaultium' },
  ],
} as const;
