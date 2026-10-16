'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { ActionState } from '@/lib/action-state';
import { parseForm, runAction } from '@/server/actions';
import { shopAction } from '@/server/auth/guards';
import { createExchange, createReturn, exchangeSchema, returnSchema } from '@/server/services/returns';

export async function createReturnAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  let target = '';
  const state = await runAction(async () => {
    const ctx = await shopAction('returns_refunds', 'add');
    const ret = form.get('mode') === 'exchange'
      ? await createExchange(ctx, parseForm(exchangeSchema, form)).then((x) => ({ path: `/shop/returns/exchange/${x.id}` }))
      : await createReturn(ctx, parseForm(returnSchema, form)).then((r) => ({ path: `/shop/returns/${r.id}` }));
    revalidatePath('/shop/returns');
    target = `${ret.path}?created=1`;
  });
  if (state.status === 'success') redirect(target);
  return state;
}
