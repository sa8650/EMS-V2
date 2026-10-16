import 'server-only';
import { ADDON_KEYS, type AddonKey } from '@/config/modules';
import type { Database, RowOf } from '@/server/db';

/**
 * Licences and add-ons. An administrator's entitlement is the active licence
 * whose period covers "now" (latest expiry first); nothing is copied into a
 * separate table, so it can never drift from the licence records.
 *
 * `modules` maps an add-on key to its allowance: messages/requests per day for
 * connectx, zudo and business_health; 1 = enabled for truebill; GB for vaultium.
 */

export type ModuleAllowances = Partial<Record<AddonKey, number>>;

export interface Entitlement {
  licenseId: string;
  title: string;
  maxShops: number;
  modules: ModuleAllowances;
  startsAt: string;
  expiresAt: string;
}

export function readModules(value: unknown): ModuleAllowances {
  const src = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const out: ModuleAllowances = {};
  for (const key of ADDON_KEYS) {
    const n = Math.floor(Number(src[key]));
    if (Number.isFinite(n) && n > 0) out[key] = n;
  }
  return out;
}

export async function currentEntitlement(db: Database, adminId: string): Promise<Entitlement | null> {
  const now = new Date().toISOString();
  const lic = await db.from('licenses').select('*')
    .eq('admin_id', adminId).eq('status', 'active').lte('starts_at', now).gt('expires_at', now)
    .order('expires_at', 'desc').limit(1).maybeSingle();
  if (!lic) return null;
  return {
    licenseId: lic.id,
    title: lic.title,
    maxShops: lic.max_shops,
    modules: readModules(lic.modules),
    startsAt: lic.starts_at!,
    expiresAt: lic.expires_at!,
  };
}

export type ReadOnlyReason = 'no_license' | 'over_limit';

/**
 * Whether a shop may change data: its administrator needs an active licence and
 * the shop must be among the oldest `maxShops` active shops of that administrator.
 */
export async function shopAccess(db: Database, shop: Pick<RowOf<'shops'>, 'id' | 'admin_id'>): Promise<{ readOnly: boolean; reason?: ReadOnlyReason; entitlement: Entitlement | null }> {
  const entitlement = await currentEntitlement(db, shop.admin_id);
  if (!entitlement) return { readOnly: true, reason: 'no_license', entitlement };
  // Deactivated shops do not use the licence, so an administrator chooses which shops stay writable.
  const allowed = await db.from('shops').select('id').eq('admin_id', shop.admin_id).eq('active', true).order('created_at').order('id').limit(entitlement.maxShops);
  const within = allowed.some((s) => s.id === shop.id);
  return within ? { readOnly: false, entitlement } : { readOnly: true, reason: 'over_limit', entitlement };
}

export interface AddonAllowance {
  key: AddonKey;
  limit: number;
  expiresAt: string | null;
}

/** The larger of the licence allowance and an active add-on purchase. */
export async function addonAllowance(db: Database, adminId: string, key: AddonKey): Promise<AddonAllowance | null> {
  const now = new Date().toISOString();
  const [ent, purchase] = await Promise.all([
    currentEntitlement(db, adminId),
    db.from('addon_purchases').select('daily_limit,expires_at')
      .eq('admin_id', adminId).eq('addon_key', key).eq('status', 'active').lte('starts_at', now).gt('expires_at', now)
      .order('expires_at', 'desc').limit(1).maybeSingle(),
  ]);
  const fromLicence = ent?.modules[key] ?? 0;
  const fromPurchase = purchase ? (key === 'truebill' ? 1 : purchase.daily_limit) : 0;
  const limit = Math.max(fromLicence, fromPurchase);
  if (limit <= 0) return null;
  const dates = [fromLicence > 0 ? ent?.expiresAt : null, fromPurchase > 0 ? purchase?.expires_at : null].filter(Boolean) as string[];
  return { key, limit, expiresAt: dates.sort().at(-1) ?? null };
}
