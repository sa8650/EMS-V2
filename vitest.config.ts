import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)),
      '@': fileURLToPath(new URL('./src/', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000,
    pool: 'forks',
    // The optional PostgreSQL target is one shared database that suites reset;
    // run files one at a time then. In-memory D1 suites stay parallel.
    fileParallelism: !process.env.EMS_TEST_SUPABASE_URL && !process.env.EMS_TEST_DATABASE_URL,
  },
});
