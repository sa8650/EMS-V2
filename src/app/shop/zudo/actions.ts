'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { ActionState } from '@/lib/action-state';
import { runAction } from '@/server/actions';
import { shopAction } from '@/server/auth/guards';
import { getEnv } from '@/server/env';
import { askZudo, deleteConversation } from '@/server/services/ai-addons';

export async function askZudoAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  let target = '';
  const state = await runAction(async () => {
    const ctx = await shopAction('zudo', 'send');
    const id = z.string().uuid().optional().or(z.literal('').transform(() => undefined)).parse(form.get('conversation') ?? undefined);
    const conv = await askZudo(ctx, await getEnv(), id ?? null, String(form.get('question') ?? ''));
    target = `/shop/zudo?c=${conv}`;
  });
  if (state.status === 'success') redirect(target);
  return state;
}

export async function deleteConversationAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await shopAction('zudo', 'delete');
    await deleteConversation(ctx, z.string().uuid().parse(form.get('id')));
    revalidatePath('/shop/zudo');
    return 'Conversation deleted.';
  });
}
