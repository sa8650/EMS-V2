'use server';

import { revalidatePath } from 'next/cache';
import type { ActionState } from '@/lib/action-state';
import { parseForm, runAction } from '@/server/actions';
import { shopAction } from '@/server/auth/guards';
import { paymentSchema, recordPayment } from '@/server/services/dues';

export async function recordPaymentAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await shopAction('due_recover', 'add');
    const input = parseForm(paymentSchema, form);
    const result = await recordPayment(ctx, input);
    revalidatePath('/shop/dues');
    return `${input.source_type === 'sale' ? 'Collected' : 'Paid'} ${input.amount.toFixed(2)} on ${result.number}.${result.remaining > 0 ? ` ${result.remaining.toFixed(2)} still due.` : ' Fully paid.'}`;
  });
}
