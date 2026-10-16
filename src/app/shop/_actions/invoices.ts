'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { ActionState } from '@/lib/action-state';
import { parseForm, runAction } from '@/server/actions';
import { shopAction } from '@/server/auth/guards';
import { deleteInvoice, invoiceSchema, postInvoice, type InvoiceKind } from '@/server/services/invoices';

const kindSchema = z.enum(['sale', 'purchase']);
const path = (kind: InvoiceKind) => (kind === 'sale' ? '/shop/sales' : '/shop/purchases');
const section = (kind: InvoiceKind) => (kind === 'sale' ? 'sales' : 'purchase');

export async function postInvoiceAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  let target = '';
  const state = await runAction(async () => {
    const kind = kindSchema.parse(form.get('kind'));
    const ctx = await shopAction(section(kind), 'add');
    const invoice = await postInvoice(ctx, parseForm(invoiceSchema, form));
    revalidatePath(path(kind));
    target = `${path(kind)}/${invoice.id}?created=1`;
  });
  if (state.status === 'success') redirect(target);
  return state;
}

export async function deleteInvoiceAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  let target = '';
  const state = await runAction(async () => {
    const kind = kindSchema.parse(form.get('kind'));
    const ctx = await shopAction(section(kind), 'delete');
    await deleteInvoice(ctx, z.string().uuid().parse(form.get('id')), kind);
    revalidatePath(path(kind));
    target = `${path(kind)}?deleted=1`;
  });
  if (state.status === 'success') redirect(target);
  return state;
}
