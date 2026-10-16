'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { ActionState } from '@/lib/action-state';
import { parseForm, runAction } from '@/server/actions';
import { requireOwner } from '@/server/auth/guards';
import { endSession } from '@/server/auth/session';
import { catalogueSchema, couponSchema, deleteCoupon, reviewPurchase, saveCatalogueItem, saveCoupon } from '@/server/services/addons';
import {
  changePassword, deletePost, factoryReset, messageSchema, pageSchema, passwordSchema, postSchema, savePage, savePost, sendHelpdeskMessage,
  setAdminActive, setMessageStatus,
} from '@/server/services/platform';
import { saveSetting } from '@/server/settings';

const uuid = z.string().uuid();
const optionalId = uuid.optional().or(z.literal('').transform(() => undefined));

export async function setAdminActiveAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireOwner();
    const active = form.get('active') === 'true';
    await setAdminActive(ctx, uuid.parse(form.get('id')), active);
    revalidatePath('/owner/administrators');
    return active ? 'Administrator activated.' : 'Administrator deactivated; they and their shops lose access immediately.';
  });
}

export async function saveAddonAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireOwner();
    await saveCatalogueItem(ctx, parseForm(catalogueSchema, form));
    revalidatePath('/owner/addons');
    return 'Add-on saved.';
  });
}

export async function saveCouponAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireOwner();
    await saveCoupon(ctx, parseForm(couponSchema, form));
    revalidatePath('/owner/addons');
    return 'Coupon saved.';
  });
}

export async function deleteCouponAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireOwner();
    await deleteCoupon(ctx, String(form.get('code') ?? ''));
    revalidatePath('/owner/addons');
    return 'Coupon deleted.';
  });
}

export async function reviewAddonAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireOwner();
    const decision = z.enum(['active', 'rejected']).parse(form.get('decision'));
    const note = z.string().trim().max(500).optional().transform((v) => v || null).parse(form.get('note') ?? undefined);
    await reviewPurchase(ctx, uuid.parse(form.get('id')), decision, note);
    revalidatePath('/owner/addons');
    return decision === 'active' ? 'Add-on activated.' : 'Request rejected.';
  });
}

export async function saveSettingAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireOwner();
    const key = z.enum(['branding', 'theme', 'addon_checkout', 'connectx_email', 'zudo', 'business_health']).parse(form.get('key'));
    const values: Record<string, unknown> = {};
    for (const [k, v] of form.entries()) if (!k.startsWith('$') && k !== 'key') values[k] = typeof v === 'string' ? v.trim() : v;
    if ('enabled' in values || ['connectx_email', 'zudo', 'business_health'].includes(key)) values.enabled = values.enabled === 'on';
    await saveSetting(ctx.db, key, values, ctx.owner.id);
    revalidatePath('/', 'layout');
    return 'Saved.';
  });
}

export async function savePageAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireOwner();
    await savePage(ctx, parseForm(pageSchema, form));
    revalidatePath('/owner/pages');
    return 'Page saved.';
  });
}

export async function savePostAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireOwner();
    const id = optionalId.parse(form.get('id') ?? undefined);
    await savePost(ctx, id, parseForm(postSchema, form));
    revalidatePath('/owner/blog');
    return id ? 'Post saved.' : 'Post created.';
  });
}

export async function deletePostAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireOwner();
    await deletePost(ctx, uuid.parse(form.get('id')));
    revalidatePath('/owner/blog');
    return 'Post deleted.';
  });
}

export async function setMessageStatusAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireOwner();
    await setMessageStatus(ctx, uuid.parse(form.get('id')), z.enum(['new', 'read', 'closed']).parse(form.get('status')));
    revalidatePath('/owner/messages');
    return 'Updated.';
  });
}

export async function sendOwnerMessageAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireOwner();
    const adminId = uuid.parse(form.get('admin_id'));
    await sendHelpdeskMessage(ctx.db, adminId, 'owner', parseForm(messageSchema, form).body);
    revalidatePath('/owner/helpdesk');
  });
}

export async function changeOwnerPasswordAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireOwner();
    await changePassword(ctx.db, 'platform_owners', ctx.owner.id, parseForm(passwordSchema, form));
    return 'Password changed.';
  });
}

export async function factoryResetAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const state = await runAction(async () => {
    const ctx = await requireOwner();
    await factoryReset(ctx, String(form.get('password') ?? ''), String(form.get('phrase') ?? ''));
    await endSession();
  });
  if (state.status === 'success') redirect('/setup');
  return state;
}
