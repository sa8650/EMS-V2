import 'server-only';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { allPermissions, can, normalizePermissions, type PermissionMap, type PermissionSection, type PermissionVerb } from '@/lib/permissions';
import { getDb, type Database, type RowOf } from '@/server/db';
import { AppError, forbidden } from '@/server/errors';
import { shopAccess, type Entitlement, type ReadOnlyReason } from '@/server/licensing';
import { getSession, type Session } from './session';

/**
 * Request contexts for the three consoles. Layouts call these to protect pages;
 * every Server Action calls them again (actions are separate HTTP endpoints).
 * Account and shop status are read from the database on every request, so a
 * deactivated account loses access immediately.
 */

export interface OwnerContext {
  db: Database;
  session: Session;
  owner: RowOf<'platform_owners'>;
}

export interface AdminContext {
  db: Database;
  session: Session;
  admin: RowOf<'admins'>;
}

export interface ShopActor {
  type: 'staff' | 'admin';
  id: string;
  name: string;
}

export interface ShopContext {
  db: Database;
  session: Session;
  shop: RowOf<'shops'>;
  actor: ShopActor;
  permissions: PermissionMap;
  readOnly: boolean;
  readOnlyReason?: ReadOnlyReason;
  entitlement: Entitlement | null;
}

export const requireOwner = cache(async (): Promise<OwnerContext> => {
  const session = await getSession();
  if (session?.role !== 'owner') redirect('/login?as=owner');
  const db = await getDb();
  const owner = await db.from('platform_owners').select('*').eq('id', session.id).maybeSingle();
  if (!owner?.active) redirect('/login?as=owner&reason=inactive');
  return { db, session, owner };
});

export const requireAdmin = cache(async (): Promise<AdminContext> => {
  const session = await getSession();
  if (session?.role !== 'admin') redirect('/login?as=admin');
  const db = await getDb();
  const admin = await db.from('admins').select('*').eq('id', session.id).maybeSingle();
  if (!admin?.active) redirect('/login?as=admin&reason=inactive');
  return { db, session, admin };
});

export const requireShop = cache(async (): Promise<ShopContext> => {
  const session = await getSession();
  if (!session?.shopId || session.role === 'owner') redirect('/login');
  const db = await getDb();
  const shop = await db.from('shops').select('*').eq('id', session.shopId).maybeSingle();
  if (!shop) redirect('/login?reason=shop-missing');

  let actor: ShopActor;
  let permissions: PermissionMap;
  if (session.role === 'staff') {
    const staff = await db.from('staff').select('id,full_name,active,permissions').eq('id', session.id).eq('shop_id', shop.id).maybeSingle();
    if (!staff?.active) redirect('/login?reason=inactive');
    if (!shop.active) redirect('/login?reason=shop-inactive');
    actor = { type: 'staff', id: staff.id, name: staff.full_name };
    permissions = normalizePermissions(staff.permissions);
  } else {
    const admin = await db.from('admins').select('id,name,active').eq('id', session.id).maybeSingle();
    if (!admin?.active || shop.admin_id !== admin.id) redirect('/login?as=admin');
    actor = { type: 'admin', id: admin.id, name: admin.name };
    permissions = allPermissions();
  }
  const access = await shopAccess(db, shop);
  return { db, session, shop, actor, permissions, readOnly: access.readOnly, readOnlyReason: access.reason, entitlement: access.entitlement };
});

/**
 * For shop pages: the shop context when the user may view at least one of the
 * sections; otherwise back to the dashboard with a notice. Navigation hides
 * these pages too, but access is enforced here.
 */
export async function requireShopView(...sections: PermissionSection[]): Promise<ShopContext> {
  const ctx = await requireShop();
  if (!sections.some((s) => can(ctx.permissions, s, 'view'))) redirect('/shop?denied=1');
  return ctx;
}

export function readOnlyMessage(reason?: ReadOnlyReason): string {
  return reason === 'over_limit'
    ? 'This shop is read-only: your licence covers fewer shops. Upgrade the licence to make changes here.'
    : 'This shop is read-only until an active licence is in place.';
}

/**
 * For shop Server Actions: the shop context, after checking the permission and,
 * for anything but viewing, that the shop is not read-only.
 */
export async function shopAction(section: PermissionSection, verb: PermissionVerb): Promise<ShopContext> {
  const ctx = await requireShop();
  if (!can(ctx.permissions, section, verb)) throw forbidden();
  if (verb !== 'view' && ctx.readOnly) throw new AppError(readOnlyMessage(ctx.readOnlyReason), 403);
  return ctx;
}
