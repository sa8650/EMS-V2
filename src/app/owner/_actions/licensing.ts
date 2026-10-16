'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { ActionState } from '@/lib/action-state';
import { parseForm, runAction } from '@/server/actions';
import { requireOwner } from '@/server/auth/guards';
import { planSchema, reviewLicence, savePlan } from '@/server/services/licences';

const optionalId = z.string().uuid().optional().or(z.literal('').transform(() => undefined));

export async function savePlanAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireOwner();
    const id = optionalId.parse(form.get('id') ?? undefined);
    await savePlan(ctx, id, parseForm(planSchema, form));
    revalidatePath('/owner/plans');
    return id ? 'Plan saved.' : 'Plan created.';
  });
}

export async function reviewLicenceAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireOwner();
    const decision = z.enum(['active', 'rejected']).parse(form.get('decision'));
    const note = z.string().trim().max(500).optional().transform((v) => v || null).parse(form.get('note') ?? undefined);
    await reviewLicence(ctx, z.string().uuid().parse(form.get('id')), decision, note);
    revalidatePath('/owner/licenses');
    return decision === 'active' ? 'Licence activated.' : 'Request rejected.';
  });
}
