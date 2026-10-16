import 'server-only';
import { z } from 'zod';
import { ADDON_KEYS } from '@/config/modules';
import { instantRange, today } from '@/lib/dates';
import { round2 } from '@/lib/invoice-math';
import { logActivity } from '@/server/activity';
import type { AdminContext, OwnerContext } from '@/server/auth/guards';
import type { Database, RowOf } from '@/server/db';
import { AppError, notFound } from '@/server/errors';
import { getSetting } from '@/server/settings';

/**
 * Add-ons bought separately from a licence: price = days × daily allowance ×
 * unit price (TrueBill counts as 1), minus an optional coupon. The owner sets
 * up the catalogue and coupons and confirms payments.
 */

const keySchema = z.enum(ADDON_KEYS);

export const catalogueSchema = z.object({
  key: keySchema,
  enabled: z.preprocess((v) => v === 'on', z.boolean()),
  title: z.string().trim().min(2).max(80),
  details: z.string().trim().max(1000).optional().transform((v) => v || null),
  unit_price: z.coerce.number().finite().min(0).max(1e7).transform(round2),
  min_days: z.coerce.number().int().min(1).max(3650),
  max_days: z.coerce.number().int().min(1).max(3650),
  min_limit: z.coerce.number().int().min(0).max(1_000_000),
  max_limit: z.coerce.number().int().min(0).max(1_000_000),
  image_url: z.string().trim().max(500).optional().transform((v) => v || null).refine((v) => !v || v.startsWith('https://'), 'Use an https:// link'),
  url: z.string().trim().max(500).optional().transform((v) => v || null).refine((v) => !v || v.startsWith('https://'), 'Use an https:// link'),
}).refine((v) => v.max_days >= v.min_days, { message: 'Maximum days must be at least the minimum', path: ['max_days'] })
  .refine((v) => v.max_limit >= v.min_limit, { message: 'Maximum allowance must be at least the minimum', path: ['max_limit'] });

export const couponSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,32}$/, '3–32 letters, numbers, - or _'),
  percent_off: z.coerce.number().int().min(1, '1–100').max(100, '1–100'),
  expires_at: z.string().optional().transform((v) => (v ? new Date(`${v}T23:59:59+06:00`).toISOString() : null)),
  active: z.preprocess((v) => v === 'on', z.boolean()),
});

export const purchaseSchema = z.object({
  addon_key: keySchema,
  days: z.coerce.number().int().positive('Choose the number of days'),
  daily_limit: z.coerce.number().int().min(0).default(1),
  coupon: z.string().trim().toUpperCase().max(32).optional().transform((v) => v || null),
  payment_method: z.enum(['bkash', 'nagad', 'bank', 'other']),
  payment_number: z.string().trim().min(3, 'Enter the number you paid from').max(40),
  transaction_id: z.string().trim().min(3, 'Enter the transaction ID').max(80),
});

export async function catalogue(db: Database) {
  return db.from('addons').select('*').order('key');
}

export async function saveCatalogueItem(ctx: OwnerContext, input: z.infer<typeof catalogueSchema>) {
  const { key, ...rest } = input;
  await ctx.db.from('addons').eq('key', key).update({ ...rest, updated_by: ctx.owner.id });
  await logActivity(ctx.db, { actorType: 'owner', actorId: ctx.owner.id, action: 'updated add-on', entityType: 'addons', entityId: key });
}

export async function coupons(db: Database) {
  return db.from('coupons').select('*').order('created_at', 'desc');
}

export async function saveCoupon(ctx: OwnerContext, input: z.infer<typeof couponSchema>) {
  await ctx.db.from('coupons').upsert(input, { onConflict: 'code' });
  await logActivity(ctx.db, { actorType: 'owner', actorId: ctx.owner.id, action: 'saved coupon', entityType: 'coupons', entityId: input.code, metadata: { percent_off: input.percent_off } });
}

export async function deleteCoupon(ctx: OwnerContext, code: string) {
  await ctx.db.from('coupons').eq('code', code).delete();
}

async function validCoupon(db: Database, code: string): Promise<RowOf<'coupons'> | null> {
  const c = await db.from('coupons').select('*').eq('code', code).eq('active', true).maybeSingle();
  if (!c || (c.expires_at && new Date(c.expires_at) < new Date())) return null;
  return c;
}

export function price(item: Pick<RowOf<'addons'>, 'unit_price' | 'key'>, days: number, limit: number, percentOff = 0) {
  const amount = round2(days * (item.key === 'truebill' ? 1 : limit) * Number(item.unit_price));
  const discount = round2((amount * percentOff) / 100);
  return { amount, discount, payable: round2(amount - discount) };
}

export async function purchaseAddon(ctx: AdminContext, input: z.infer<typeof purchaseSchema>) {
  const item = await ctx.db.from('addons').select('*').eq('key', input.addon_key).eq('enabled', true).maybeSingle();
  if (!item) throw new AppError('That add-on is not available.', 400);
  const limit = item.key === 'truebill' ? 1 : input.daily_limit;
  if (input.days < item.min_days || input.days > item.max_days) throw new AppError(`Choose between ${item.min_days} and ${item.max_days} days.`, 400, { days: `${item.min_days}–${item.max_days}` });
  if (item.key !== 'truebill' && (limit < item.min_limit || limit > item.max_limit)) throw new AppError(`Choose an allowance between ${item.min_limit} and ${item.max_limit}.`, 400, { daily_limit: `${item.min_limit}–${item.max_limit}` });
  const now = new Date().toISOString();
  if (await ctx.db.from('addon_purchases').eq('admin_id', ctx.admin.id).eq('addon_key', item.key).in('status', ['pending', 'active']).gt('expires_at', now).count()
    || await ctx.db.from('addon_purchases').eq('admin_id', ctx.admin.id).eq('addon_key', item.key).eq('status', 'pending').count()) {
    throw new AppError('You already have this add-on active or waiting for review.', 409);
  }
  let percent = 0;
  if (input.coupon) {
    const c = await validCoupon(ctx.db, input.coupon);
    if (!c) throw new AppError('That coupon is not valid.', 400, { coupon: 'Invalid or expired' });
    percent = c.percent_off;
  }
  const p = price(item, input.days, limit, percent);
  const row = await ctx.db.from('addon_purchases').insertOne({
    admin_id: ctx.admin.id, addon_key: item.key, days: input.days, daily_limit: limit, unit_price: item.unit_price, amount: p.amount,
    coupon_code: percent ? input.coupon : null, discount_amount: p.discount, payment_method: input.payment_method, payment_number: input.payment_number,
    transaction_id: input.transaction_id, status: 'pending',
  });
  await logActivity(ctx.db, { adminId: ctx.admin.id, actorType: 'admin', actorId: ctx.admin.id, action: 'requested add-on', entityType: 'addon_purchases', entityId: row.id, metadata: { title: item.title, amount: p.payable } });
  return { row, payable: p.payable };
}

export async function adminPurchases(db: Database, adminId: string) {
  return db.from('addon_purchases').select('*').eq('admin_id', adminId).order('created_at', 'desc').limit(50);
}

export async function ownerPurchases(db: Database, status?: string) {
  const q = db.from('addon_purchases').select('*,admins(name,email)').order('created_at', 'desc').limit(100);
  return (status ? q.eq('status', status) : q) as unknown as Promise<(RowOf<'addon_purchases'> & { admins: { name: string; email: string } | null })[]>;
}

export async function reviewPurchase(ctx: OwnerContext, id: string, decision: 'active' | 'rejected', note: string | null) {
  const p = await ctx.db.from('addon_purchases').select('*').eq('id', id).maybeSingle();
  if (!p) throw notFound('Add-on request');
  if (p.status !== 'pending') throw new AppError('This request has already been reviewed.', 409);
  const now = new Date();
  const expires = new Date(now.getTime() + p.days * 86_400_000);
  await ctx.db.from('addon_purchases').eq('id', id).update({
    status: decision, reviewed_at: now.toISOString(), reviewed_by: ctx.owner.id, review_note: note,
    ...(decision === 'active' ? { starts_at: now.toISOString(), expires_at: expires.toISOString() } : {}),
  });
  await logActivity(ctx.db, { adminId: p.admin_id, actorType: 'owner', actorId: ctx.owner.id, action: decision === 'active' ? 'approved add-on' : 'rejected add-on', entityType: 'addon_purchases', entityId: id, metadata: { addon: p.addon_key } });
}

export async function checkoutInfo(db: Database) {
  return (await getSetting(db, 'addon_checkout')).payment_info;
}

/** Today's add-on use per shop of an administrator (ConnectX messages, Zudo questions, health reports). */
export async function usageToday(db: Database, adminId: string) {
  const since = instantRange(today(), today()).start;
  const shops = await db.from('shops').select('id,name').eq('admin_id', adminId).order('name');
  return Promise.all(shops.map(async (s) => {
    const [emails, sms, zudo, health] = await Promise.all([
      db.from('email_messages').eq('shop_id', s.id).gte('created_at', since).count(),
      db.from('sms_messages').eq('shop_id', s.id).gte('created_at', since).count(),
      db.from('zudo_messages').eq('shop_id', s.id).eq('role', 'user').gte('created_at', since).count(),
      db.from('business_health_reports').eq('shop_id', s.id).gte('created_at', since).count(),
    ]);
    return { id: s.id, name: s.name, connectx: emails + sms, zudo, health };
  }));
}
