'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { ActionState } from '@/lib/action-state';
import { parseForm, runAction } from '@/server/actions';
import { shopAction } from '@/server/auth/guards';
import { getEnv } from '@/server/env';
import { cancelSms, emailSchema, hideEmail, saveSmsSettings, sendManualSms, sendShopEmail, smsSchema } from '@/server/connectx/email';

const done = () => revalidatePath('/shop/connectx');

export async function sendEmailAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await shopAction('connectx', 'send');
    await sendShopEmail(ctx, await getEnv(), parseForm(emailSchema, form));
    done();
    return 'Email sent.';
  });
}

export async function hideEmailAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await shopAction('connectx', 'delete');
    await hideEmail(ctx, z.string().uuid().parse(form.get('id')));
    done();
    return 'Removed from the list.';
  });
}

export async function sendSmsAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await shopAction('connectx', 'send');
    const id = await sendManualSms(ctx, parseForm(smsSchema, form));
    done();
    return `SMS queued (${id}). It is sent by the paired Connect App phone.`;
  });
}

export async function cancelSmsAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await shopAction('connectx', 'delete');
    await cancelSms(ctx, z.string().uuid().parse(form.get('id')));
    done();
    return 'SMS cancelled.';
  });
}

export async function saveSmsSettingsAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await shopAction('settings', 'edit');
    await saveSmsSettings(ctx, form);
    done();
    return 'SMS settings saved.';
  });
}
