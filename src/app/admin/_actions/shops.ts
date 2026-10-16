'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { ActionState } from '@/lib/action-state';
import { parseForm, runAction } from '@/server/actions';
import { requireAdmin } from '@/server/auth/guards';
import { getEnv } from '@/server/env';
import { requestLicence, requestSchema } from '@/server/services/licences';
import { createShop, deleteShop, setShopActive, shopSchema, updateShop } from '@/server/services/shops';

const optionalId = z.string().uuid().optional().or(z.literal('').transform(() => undefined));

export async function saveShopAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireAdmin();
    const id = optionalId.parse(form.get('id') ?? undefined);
    const input = parseForm(shopSchema, form);
    if (id) await updateShop(ctx, id, input);
    else await createShop(ctx, input);
    revalidatePath('/admin/shops');
    revalidatePath('/admin');
    return id ? 'Shop saved.' : 'Shop created. Open it to add products and staff.';
  });
}

export async function setShopActiveAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireAdmin();
    const active = form.get('active') === 'true';
    await setShopActive(ctx, z.string().uuid().parse(form.get('id')), active);
    revalidatePath('/admin/shops');
    return active ? 'Shop activated.' : 'Shop deactivated. Its staff can no longer sign in.';
  });
}

export async function deleteShopAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireAdmin();
    await deleteShop(ctx, await getEnv(), z.string().uuid().parse(form.get('id')), String(form.get('confirm') ?? ''));
    revalidatePath('/admin/shops');
    return 'Shop deleted.';
  });
}

export async function requestLicenceAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireAdmin();
    await requestLicence(ctx, parseForm(requestSchema, form));
    revalidatePath('/admin/licenses');
    return 'Request sent. Your licence is activated once the payment is confirmed.';
  });
}
