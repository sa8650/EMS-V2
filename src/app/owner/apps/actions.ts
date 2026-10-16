'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { ActionState } from '@/lib/action-state';
import { runAction } from '@/server/actions';
import { requireOwner } from '@/server/auth/guards';
import { getEnv } from '@/server/env';
import { deleteApp, parseAppForm, saveApp } from '@/server/services/app-store';

const file = (v: FormDataEntryValue | null) => (v && typeof v !== 'string' && v.size > 0 ? v : null);

export async function saveAppAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { db } = await requireOwner();
    const id = z.string().uuid().optional().or(z.literal('').transform(() => undefined)).parse(form.get('id') ?? undefined);
    await saveApp(db, await getEnv(), id ?? null, parseAppForm(form), file(form.get('apk')), file(form.get('icon')));
    revalidatePath('/owner/apps');
    revalidatePath('/apps');
    return id ? 'App saved.' : 'App added.';
  });
}

export async function deleteAppAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { db } = await requireOwner();
    await deleteApp(db, await getEnv(), z.string().uuid().parse(form.get('id')));
    revalidatePath('/owner/apps');
    return 'App deleted.';
  });
}
