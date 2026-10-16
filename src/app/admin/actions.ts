'use server';

import { redirect } from 'next/navigation';
import { requireAdmin, requireShop } from '@/server/auth/guards';
import { startSession } from '@/server/auth/session';
import { logActivity } from '@/server/activity';
import { notFound as missing } from '@/server/errors';

/** Lets an administrator work inside one of their own shops (full permissions). */
export async function enterShopAction(form: FormData): Promise<void> {
  const { db, admin } = await requireAdmin();
  const shop = await db.from('shops').select('id').eq('id', String(form.get('shopId') ?? '')).eq('admin_id', admin.id).maybeSingle();
  if (!shop) throw missing('Shop');
  await startSession({ role: 'admin', id: admin.id, shopId: shop.id });
  await logActivity(db, { shopId: shop.id, adminId: admin.id, actorType: 'admin', actorId: admin.id, action: 'opened shop console', entityType: 'shop', entityId: shop.id });
  redirect('/shop');
}

export async function leaveShopAction(): Promise<void> {
  const ctx = await requireShop();
  if (ctx.actor.type !== 'admin') redirect('/shop');
  await startSession({ role: 'admin', id: ctx.actor.id });
  redirect('/admin');
}
