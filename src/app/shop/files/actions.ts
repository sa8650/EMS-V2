'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { ActionState } from '@/lib/action-state';
import { runAction } from '@/server/actions';
import { shopAction } from '@/server/auth/guards';
import { getEnv } from '@/server/env';
import { deleteFile, uploadFiles } from '@/server/services/vaultium';

export async function uploadFilesAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await shopAction('vaultium', 'add');
    const link = String(form.get('link') ?? '');
    const ref = String(form.get('reference') ?? '').trim();
    const files = form.getAll('files').filter((f): f is File => typeof f !== 'string');
    const n = await uploadFiles(ctx, await getEnv(), files, link === 'invoice' ? { invoiceNumber: ref } : link === 'expense' ? { expenseCode: ref } : {});
    revalidatePath('/shop/files');
    return `${n} file${n === 1 ? '' : 's'} uploaded.`;
  });
}

export async function deleteFileAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await shopAction('vaultium', 'delete');
    await deleteFile(ctx, await getEnv(), z.string().uuid().parse(form.get('id')));
    revalidatePath('/shop/files');
    return 'File deleted.';
  });
}
