'use server';

import type { ActionState } from '@/lib/action-state';
import { parseForm, runAction } from '@/server/actions';
import { isThrottled, recordAttempt } from '@/server/auth/throttle';
import { requestMeta } from '@/server/auth/session';
import { getDb } from '@/server/db';
import { AppError } from '@/server/errors';
import { contactSchema, createContactMessage } from '@/server/services/website';

export async function sendContactMessage(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const input = parseForm(contactSchema, form);
    const db = await getDb();
    const { ip } = await requestMeta();
    if (await isThrottled(db, 'contact', ip)) throw new AppError('Too many messages from your network. Please try again later.', 429);
    await recordAttempt(db, 'contact', ip);
    await createContactMessage(db, input);
    return 'Thank you — your message has been sent. We will reply by email.';
  });
}
