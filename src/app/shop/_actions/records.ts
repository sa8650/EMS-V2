'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { ActionState } from '@/lib/action-state';
import { parseForm, runAction } from '@/server/actions';
import { shopAction } from '@/server/auth/guards';
import {
  createExpense, createParty, createProduct, deleteExpense, deleteParty, expenseSchema, partySchema, productSchema, removeProduct,
  restoreProduct, updateExpense, updateParty, updateProduct,
} from '@/server/services/records';

const id = z.string().uuid().optional().or(z.literal('').transform(() => undefined));
const partyTable = z.enum(['customers', 'suppliers']);
const SECTION = { customers: 'customer', suppliers: 'supplier' } as const;

export async function savePartyAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const table = partyTable.parse(form.get('table'));
    const recordId = id.parse(form.get('id') ?? undefined);
    const ctx = await shopAction(SECTION[table], recordId ? 'edit' : 'add');
    const input = parseForm(partySchema, form);
    if (recordId) await updateParty(ctx, table, recordId, input);
    else await createParty(ctx, table, input);
    revalidatePath(`/shop/${table}`);
    return recordId ? 'Saved.' : `${table === 'customers' ? 'Customer' : 'Supplier'} added.`;
  });
}

export async function deletePartyAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const table = partyTable.parse(form.get('table'));
    const ctx = await shopAction(SECTION[table], 'delete');
    await deleteParty(ctx, table, z.string().uuid().parse(form.get('id')));
    revalidatePath(`/shop/${table}`);
    return 'Deleted.';
  });
}

export async function saveProductAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const recordId = id.parse(form.get('id') ?? undefined);
    const ctx = await shopAction('inventory', recordId ? 'edit' : 'add');
    const input = parseForm(productSchema, form);
    if (recordId) await updateProduct(ctx, recordId, input);
    else await createProduct(ctx, input);
    revalidatePath('/shop/inventory');
    return recordId ? 'Saved.' : 'Product added. Stock arrives with a purchase invoice.';
  });
}

export async function removeProductAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await shopAction('inventory', 'delete');
    const result = await removeProduct(ctx, z.string().uuid().parse(form.get('id')));
    revalidatePath('/shop/inventory');
    return result === 'deleted' ? 'Product deleted.' : 'The product is on invoices, so it was deactivated instead of deleted.';
  });
}

export async function restoreProductAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await shopAction('inventory', 'edit');
    await restoreProduct(ctx, z.string().uuid().parse(form.get('id')));
    revalidatePath('/shop/inventory');
    return 'Product restored.';
  });
}

export async function saveExpenseAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const recordId = id.parse(form.get('id') ?? undefined);
    const ctx = await shopAction('expense', recordId ? 'edit' : 'add');
    const input = parseForm(expenseSchema, form);
    if (recordId) await updateExpense(ctx, recordId, input);
    else await createExpense(ctx, input);
    revalidatePath('/shop/expenses');
    return recordId ? 'Saved.' : 'Expense recorded.';
  });
}

export async function deleteExpenseAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await shopAction('expense', 'delete');
    await deleteExpense(ctx, z.string().uuid().parse(form.get('id')));
    revalidatePath('/shop/expenses');
    return 'Expense deleted.';
  });
}
