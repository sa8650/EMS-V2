import 'server-only';
import { z } from 'zod';
import type { D1Database, R2Bucket, WorkersAi } from '@/types/cloudflare';

/**
 * Server-side runtime configuration.
 *
 * Values come from two places, merged in this order:
 *  1. `process.env` (Node.js deployments, `next dev`, `.env.local`)
 *  2. Cloudflare bindings + vars/secrets (OpenNext worker / `next dev` with
 *     Wrangler bindings) — these win when present.
 *
 * Nothing in this file is ever sent to the browser (`server-only`).
 */

const optionalSecret = z.string().trim().min(1).optional().catch(undefined);

const envSchema = z.object({
  NODE_ENV: z.string().optional(),
  SESSION_SECRET: z.string().min(1, 'SESSION_SECRET is required'),
  DB_DRIVER: z
    .string()
    .optional()
    .transform((v) => (v ?? '').trim().toLowerCase()),
  SUPABASE_URL: z.string().url().optional().catch(undefined),
  /** Server-only Supabase key: a secret key (`sb_secret_…`) or a legacy service_role key. */
  SUPABASE_SERVICE_ROLE_KEY: optionalSecret,
  /** Alias matching Supabase's current dashboard wording; used when SUPABASE_SERVICE_ROLE_KEY is unset. */
  SUPABASE_SECRET_KEY: optionalSecret,
  /** Public site origin used for canonical URLs, sitemap and verification links. */
  SITE_URL: z.string().url().optional().catch(undefined),
  BREVO_API_KEY: optionalSecret,
  GEMINI_API_KEY: optionalSecret,
  GROQ_API_KEY: optionalSecret,
  CEREBRAS_API_KEY: optionalSecret,
  DEEPSEEK_API_KEY: optionalSecret,
  OPENROUTER_API_KEY: optionalSecret,
  GITHUB_TOKEN: optionalSecret,
  ANTHROPIC_API_KEY: optionalSecret,
  /** Test-only switches: deterministic AI replies / skip real email delivery. */
  MOCK_AI: z.string().optional(),
  MOCK_EMAIL: z.string().optional(),
});

export type EnvVars = z.infer<typeof envSchema>;

export interface Bindings {
  DB?: D1Database;
  AI?: WorkersAi;
  /** R2 bucket for Vaultium documents (vaultium/…) and App Store files (apps/…). */
  FILES?: R2Bucket;
}

export type AppEnv = EnvVars & Bindings & { provider: 'd1' | 'supabase' };

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

let warnedShortSecret = false;

/** Validates raw values and resolves the database provider. */
export function parseEnv(raw: Record<string, unknown>): AppEnv {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join('.') || i.message).join(', ');
    throw new ConfigError(`Server configuration is incomplete: missing ${missing}.`);
  }
  const vars = { ...parsed.data, SUPABASE_SERVICE_ROLE_KEY: parsed.data.SUPABASE_SERVICE_ROLE_KEY ?? parsed.data.SUPABASE_SECRET_KEY };
  const bindings: Bindings = {
    DB: raw.DB as D1Database | undefined,
    AI: raw.AI as WorkersAi | undefined,
    FILES: raw.FILES as R2Bucket | undefined,
  };
  // Same selection rule as the original driver: explicit DB_DRIVER=d1 wins;
  // otherwise D1 is used only when Supabase is not configured and DB is bound.
  const provider: AppEnv['provider'] =
    vars.DB_DRIVER === 'd1' || (!vars.SUPABASE_URL && !!bindings.DB) ? 'd1' : 'supabase';

  if (provider === 'd1' && !bindings.DB) {
    throw new ConfigError('Server configuration is incomplete: missing DB (D1 binding).');
  }
  if (provider === 'supabase' && !(vars.SUPABASE_URL && vars.SUPABASE_SERVICE_ROLE_KEY)) {
    throw new ConfigError(
      'Server configuration is incomplete: missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY), or set DB_DRIVER=d1 with a D1 binding named DB.',
    );
  }
  if (vars.SESSION_SECRET.length < 32 && !warnedShortSecret) {
    warnedShortSecret = true;
    console.warn('[ems] SESSION_SECRET is shorter than 32 characters. Generate one with `openssl rand -base64 48`.');
  }
  return { ...vars, ...bindings, provider };
}

/**
 * Cloudflare bindings for the current request. OpenNext publishes the request
 * context on this global symbol inside the Worker (and in `next dev` after
 * initOpenNextCloudflareForDev). Elsewhere — a Node.js deployment or the build —
 * there are no bindings and configuration comes from process.env only.
 */
const CLOUDFLARE_CONTEXT = Symbol.for('__cloudflare-context__');

function cloudflareEnv(): Record<string, unknown> {
  const ctx = (globalThis as Record<symbol, unknown>)[CLOUDFLARE_CONTEXT] as { env?: Record<string, unknown> } | undefined;
  return ctx?.env ?? {};
}

/** Resolves the validated environment for the current request. */
export async function getEnv(): Promise<AppEnv> {
  return parseEnv({ ...process.env, ...cloudflareEnv() });
}
