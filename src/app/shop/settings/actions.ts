'use server';

import { revalidatePath } from 'next/cache';
import type { ActionState } from '@/lib/action-state';
import { parseForm, runAction } from '@/server/actions';
import { shopAction } from '@/server/auth/guards';
import { shopSchema, updateOwnShop } from '@/server/services/shops';

export async function saveShopSettingsAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await shopAction('settings', 'edit');
    await updateOwnShop(ctx, parseForm(shopSchema, form));
    revalidatePath('/shop', 'layout');
    return 'Shop settings saved.';
  });
}
