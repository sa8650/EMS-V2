'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { ActionState } from '@/lib/action-state';
import { parseForm, runAction } from '@/server/actions';
import { requireAdmin } from '@/server/auth/guards';
import { purchaseAddon, purchaseSchema } from '@/server/services/addons';
import { changePassword, forgetDevice, messageSchema, passwordSchema, profileSchema, sendHelpdeskMessage, updateProfile } from '@/server/services/platform';

export async function purchaseAddonAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireAdmin();
    const { payable } = await purchaseAddon(ctx, parseForm(purchaseSchema, form));
    revalidatePath('/admin/addons');
    return `Request sent (${payable.toFixed(2)}). The add-on starts once the payment is confirmed.`;
  });
}

export async function sendAdminMessageAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireAdmin();
    await sendHelpdeskMessage(ctx.db, ctx.admin.id, 'admin', parseForm(messageSchema, form).body);
    revalidatePath('/admin/helpdesk');
  });
}

export async function saveProfileAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireAdmin();
    await updateProfile(ctx, parseForm(profileSchema, form));
    revalidatePath('/admin', 'layout');
    return 'Profile saved.';
  });
}

export async function changeAdminPasswordAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireAdmin();
    await changePassword(ctx.db, 'admins', ctx.admin.id, parseForm(passwordSchema, form));
    return 'Password changed.';
  });
}

export async function forgetDeviceAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireAdmin();
    await forgetDevice(ctx, z.string().uuid().parse(form.get('id')));
    revalidatePath('/admin/devices');
    return 'Device removed from the list.';
  });
}
