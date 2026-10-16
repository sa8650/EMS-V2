import { describe, expect, it } from 'vitest';
import { ConfigError, parseEnv } from '@/server/env';

describe('server configuration', () => {
  const secret = 'x'.repeat(48);
  it('selects Supabase and accepts the SUPABASE_SECRET_KEY alias', () => {
    const env = parseEnv({ SESSION_SECRET: secret, SUPABASE_URL: 'https://p.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_k' });
    expect(env.provider).toBe('supabase');
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBe('sb_secret_k');
  });
  it('selects D1 when DB_DRIVER=d1 or when only a D1 binding exists', () => {
    const DB = {} as never;
    expect(parseEnv({ SESSION_SECRET: secret, DB_DRIVER: 'd1', DB, SUPABASE_URL: 'https://p.supabase.co' }).provider).toBe('d1');
    expect(parseEnv({ SESSION_SECRET: secret, DB }).provider).toBe('d1');
  });
  it('explains what is missing', () => {
    expect(() => parseEnv({ SUPABASE_URL: 'https://p.supabase.co' })).toThrow(ConfigError);
    expect(() => parseEnv({ SESSION_SECRET: secret })).toThrow(/SUPABASE_URL/);
  });
});
