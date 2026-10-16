'use server';

import { revalidatePath } from 'next/cache';
import type { ActionState } from '@/lib/action-state';
import { isYmd } from '@/lib/dates';
import { runAction } from '@/server/actions';
import { shopAction } from '@/server/auth/guards';
import { getEnv } from '@/server/env';
import { AppError } from '@/server/errors';
import { createHealthReport } from '@/server/services/ai-addons';

export async function healthReportAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await shopAction('report', 'view');
    if (ctx.readOnly) throw new AppError('This shop is read-only.', 403);
    const from = String(form.get('from') ?? '');
    const to = String(form.get('to') ?? '');
    if (!isYmd(from) || !isYmd(to)) throw new AppError('Pick a start and end date.', 400);
    const r = await createHealthReport(ctx, await getEnv(), from, to);
    revalidatePath('/shop/health');
    return `Report ready: score ${r.score}/100.`;
  });
}
