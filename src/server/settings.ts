import 'server-only';
import { z } from 'zod';
import { DEFAULT_MODEL } from '@/server/ai';
import type { Database } from '@/server/db';

/**
 * Platform-wide settings, one JSON row per key in the `settings` table. Every
 * key has a schema with defaults, so a missing row simply means "defaults" and
 * stored values are always validated on read and on write.
 */

const hex = z.string().regex(/^#[0-9a-f]{6}$/i, 'Use a colour like #2563eb');
const limit = z.coerce.number().int().min(0).max(1_000_000);

export const SETTING_SCHEMAS = {
  branding: z.object({
    product_name: z.string().trim().min(1).max(40).default('EMS'),
    tagline: z.string().trim().max(120).default('Shop management for growing businesses'),
    powered_by: z.string().trim().max(60).default('DoxTox'),
    support_email: z.string().trim().max(120).default(''),
    support_phone: z.string().trim().max(40).default(''),
  }),
  theme: z.object({
    primary: hex.default('#059669'),
    accent: hex.default('#0284c7'),
  }),
  connectx_email: z.object({
    enabled: z.boolean().default(false),
    from_name: z.string().trim().max(80).default(''),
    from_email: z.string().trim().max(120).default(''),
    reply_to: z.string().trim().max(120).default(''),
    global_daily_limit: limit.default(0),
  }),
  zudo: z.object({ enabled: z.boolean().default(false), model: z.string().default(DEFAULT_MODEL), global_daily_limit: limit.default(0) }),
  business_health: z.object({ enabled: z.boolean().default(false), model: z.string().default(DEFAULT_MODEL), global_daily_limit: limit.default(0) }),
  addon_checkout: z.object({ payment_info: z.string().trim().max(2000).default('') }),
  connect_identity: z.object({
    application_id: z.string().default(''),
    application_name: z.string().default(''),
    endpoint_override: z.string().default(''),
  }),
} as const;

export type SettingKey = keyof typeof SETTING_SCHEMAS;
export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTING_SCHEMAS)[K]>;

export async function getSetting<K extends SettingKey>(db: Database, key: K): Promise<SettingValue<K>> {
  const row = await db.from('settings').select('value').eq('key', key).maybeSingle();
  const schema = SETTING_SCHEMAS[key];
  const parsed = schema.safeParse(row?.value ?? {});
  return (parsed.success ? parsed.data : schema.parse({})) as SettingValue<K>;
}

/** Validates (throws ZodError on invalid input) and stores a setting. */
export async function saveSetting<K extends SettingKey>(db: Database, key: K, value: unknown, updatedBy: string | null): Promise<SettingValue<K>> {
  const parsed = SETTING_SCHEMAS[key].parse(value) as SettingValue<K>;
  await db.from('settings').upsert({ key, value: parsed, updated_by: updatedBy }, { onConflict: 'key' });
  return parsed;
}
