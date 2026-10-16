import 'server-only';
import { z } from 'zod';
import { logActivity } from '@/server/activity';
import { uniqueCode } from '@/server/auth/accounts';
import type { AdminContext, ShopContext } from '@/server/auth/guards';
import type { Database } from '@/server/db';
import type { AppEnv } from '@/server/env';
import { AppError, notFound } from '@/server/errors';
import { currentEntitlement } from '@/server/licensing';

/** Shops of an administrator, and the shop's own settings. */

const optional = (max: number) => z.string().trim().max(max).optional().transform((v) => v || null);

export const shopSchema = z.object({
  name: z.string().trim().min(2, 'Enter the shop name').max(120),
  category: z.string().trim().min(2).max(60).default('General Store'),
  address: optional(300),
  phone: optional(30),
  phone2: optional(30),
  email: z.string().trim().toLowerCase().max(120).optional().transform((v) => v || null).refine((v) => !v || z.string().email().safeParse(v).success, 'Enter a valid email'),
  website: optional(200),
  low_stock_threshold: z.coerce.number().int().min(0).max(1_000_000).default(5),
});

export async function adminShops(db: Database, adminId: string) {
  return db.from('shops').select('*').eq('admin_id', adminId).order('created_at').order('id');
}

export async function createShop(ctx: AdminContext, input: z.infer<typeof shopSchema>) {
  const ent = await currentEntitlement(ctx.db, ctx.admin.id);
  if (!ent) throw new AppError('Activate a licence plan before creating your first shop.', 403);
  const active = await ctx.db.from('shops').eq('admin_id', ctx.admin.id).eq('active', true).count();
  if (active >= ent.maxShops) {
    throw new AppError(`Your licence covers ${ent.maxShops} active shop${ent.maxShops === 1 ? '' : 's'}. Upgrade the licence or deactivate a shop first.`, 403);
  }
  const shop = await ctx.db.from('shops').insertOne({ ...input, admin_id: ctx.admin.id, shop_code: await uniqueCode(ctx.db, 'shops') });
  await logActivity(ctx.db, { adminId: ctx.admin.id, shopId: shop.id, actorType: 'admin', actorId: ctx.admin.id, action: 'created shop', entityType: 'shops', entityId: shop.id, metadata: { name: shop.name, code: shop.shop_code } });
  return shop;
}

export async function updateShop(ctx: AdminContext, id: string, input: z.infer<typeof shopSchema>) {
  const [row] = await ctx.db.from('shops').eq('id', id).eq('admin_id', ctx.admin.id).update(input);
  if (!row) throw notFound('Shop');
  await logActivity(ctx.db, { adminId: ctx.admin.id, shopId: id, actorType: 'admin', actorId: ctx.admin.id, action: 'updated shop', entityType: 'shops', entityId: id });
}

/** Deactivated shops do not use the licence; their staff cannot sign in. */
export async function setShopActive(ctx: AdminContext, id: string, active: boolean) {
  const [row] = await ctx.db.from('shops').eq('id', id).eq('admin_id', ctx.admin.id).update({ active });
  if (!row) throw notFound('Shop');
  await logActivity(ctx.db, { adminId: ctx.admin.id, shopId: id, actorType: 'admin', actorId: ctx.admin.id, action: active ? 'activated shop' : 'deactivated shop', entityType: 'shops', entityId: id });
}

/** Permanently deletes a shop and all of its records; the Shop ID must be typed to confirm. */
export async function deleteShop(ctx: AdminContext, env: AppEnv, id: string, confirmCode: string) {
  const shop = await ctx.db.from('shops').select('id,name,shop_code').eq('id', id).eq('admin_id', ctx.admin.id).maybeSingle();
  if (!shop) throw notFound('Shop');
  if (confirmCode.trim() !== shop.shop_code) throw new AppError('Type the Shop ID exactly to confirm.', 400, { confirm: `Type ${shop.shop_code}` });
  const files = await ctx.db.from('vaultium_files').select('r2_key').eq('shop_id', id);
  if (files.length && env.FILES) await env.FILES.delete(files.map((f) => f.r2_key)).catch((e) => console.error('[ems] file cleanup failed', e));
  await ctx.db.from('shops').eq('id', id).eq('admin_id', ctx.admin.id).delete();
  await logActivity(ctx.db, { adminId: ctx.admin.id, actorType: 'admin', actorId: ctx.admin.id, action: 'deleted shop', entityType: 'shops', entityId: id, metadata: { name: shop.name, code: shop.shop_code } });
}

/** Shop settings edited inside the shop console (settings permission). */
export async function updateOwnShop(ctx: ShopContext, input: z.infer<typeof shopSchema>) {
  await ctx.db.from('shops').eq('id', ctx.shop.id).update(input);
  await logActivity(ctx.db, { shopId: ctx.shop.id, actorType: ctx.actor.type, actorId: ctx.actor.id, action: 'updated shop settings', entityType: 'shops', entityId: ctx.shop.id });
}
