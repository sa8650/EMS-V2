'use server';

import { redirect } from 'next/navigation';
import type { ActionState } from '@/lib/action-state';
import { errorState, parseForm, runAction } from '@/server/actions';
import {
  confirmPasswordReset, createFirstOwner, registerAdmin, requestPasswordReset, schemas, signInAdmin, signInOwner, signInShop,
} from '@/server/auth/accounts';
import { endSession, requestMeta, startSession, type Session } from '@/server/auth/session';
import { getDb } from '@/server/db';
import { getEnv } from '@/server/env';

const home = (s: Omit<Session, 'exp'>) => (s.role === 'owner' ? '/owner' : s.shopId ? '/shop' : '/admin');

export async function signInAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  let target = '';
  const state = await runAction(async () => {
    const db = await getDb();
    const meta = await requestMeta();
    const as = String(form.get('as') ?? 'staff');
    const signed =
      as === 'owner'
        ? await signInOwner(db, parseForm(schemas.adminLogin, form), meta)
        : as === 'admin'
          ? await signInAdmin(db, parseForm(schemas.adminLogin, form), meta)
          : await signInShop(db, parseForm(schemas.staffLogin, form), meta);
    await startSession(signed);
    target = home(signed);
  });
  if (state.status === 'success') redirect(target);
  return state;
}

export async function registerAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const state = await runAction(async () => {
    const db = await getDb();
    await startSession(await registerAdmin(db, parseForm(schemas.register, form)));
  });
  if (state.status === 'success') redirect('/admin');
  return state;
}

export async function setupAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const state = await runAction(async () => {
    const db = await getDb();
    await startSession(await createFirstOwner(db, parseForm(schemas.setup, form)));
  });
  if (state.status === 'success') redirect('/owner');
  return state;
}

export interface ResetState extends ActionState {
  step: 'request' | 'confirm' | 'done';
  token?: string;
  type?: string;
}

export async function resetAction(prev: ResetState, form: FormData): Promise<ResetState> {
  try {
    const db = await getDb();
    const env = await getEnv();
    if (form.get('step') === 'confirm') {
      await confirmPasswordReset(db, env, parseForm(schemas.resetConfirm, form));
      return { step: 'done', status: 'success', message: 'Your password has been changed. You can sign in now.', type: prev.type };
    }
    const input = parseForm(schemas.resetRequest, form);
    const token = await requestPasswordReset(db, env, input);
    return {
      step: 'confirm',
      token,
      type: input.type,
      status: 'success',
      message: 'If an account matches, we have emailed a 6-digit code. It expires in 10 minutes.',
    };
  } catch (e) {
    return { ...prev, ...errorState(e), at: Date.now() };
  }
}

export async function signOutAction(): Promise<void> {
  await endSession();
  redirect('/login');
}
