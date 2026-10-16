'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { ActionForm, FormMessage, SelectField, SubmitButton, TextField } from '@/components/ui/form';
import { registerAction, resetAction, setupAction, signInAction, type ResetState } from './actions';
import s from './auth.module.css';

export type SignInMode = 'staff' | 'admin' | 'owner';

export function SignInForm({ mode }: { mode: SignInMode }) {
  return (
    <ActionForm action={signInAction} submitLabel="Sign in" block>
      <input type="hidden" name="as" value={mode} />
      {mode === 'staff' ? (
        <>
          <TextField label="Shop ID" name="shopCode" inputMode="numeric" autoComplete="off" maxLength={4} placeholder="4 digits" />
          <TextField label="User ID" name="userId" autoComplete="username" hint="Administrators can use their email here." />
        </>
      ) : (
        <TextField label="Email" name="email" type="email" autoComplete="username" />
      )}
      <TextField label="Password" name="password" type="password" autoComplete="current-password" />
    </ActionForm>
  );
}

export function RegisterForm() {
  return (
    <ActionForm action={registerAction} submitLabel="Create account" block>
      <TextField label="Your name" name="name" autoComplete="name" />
      <TextField label="Email" name="email" type="email" autoComplete="email" />
      <TextField label="Phone" name="phone" type="tel" autoComplete="tel" />
      <TextField label="Password" name="password" type="password" autoComplete="new-password" hint="At least 10 characters." />
    </ActionForm>
  );
}

export function SetupForm() {
  return (
    <ActionForm action={setupAction} submitLabel="Create platform owner" block>
      <TextField label="Your name" name="name" autoComplete="name" />
      <TextField label="Email" name="email" type="email" autoComplete="email" />
      <TextField label="Password" name="password" type="password" autoComplete="new-password" hint="At least 12 characters. Keep it private." />
    </ActionForm>
  );
}

export function ResetFlow() {
  const [state, action] = useActionState<ResetState, FormData>(resetAction, { step: 'request', status: 'idle' });
  if (state.step === 'done') {
    return (
      <div className={s.card}>
        <FormMessage state={state} />
        <Link href={`/login?as=${state.type === 'staff' ? 'staff' : state.type ?? 'staff'}`}>Go to sign in</Link>
      </div>
    );
  }
  return (
    <form action={action} className={s.card} noValidate>
      {state.step === 'request' ? (
        <>
          <input type="hidden" name="step" value="request" />
          <SelectField
            label="Account type"
            name="type"
            options={[
              { value: 'staff', label: 'Shop staff' },
              { value: 'admin', label: 'Administrator' },
              { value: 'owner', label: 'Platform owner' },
            ]}
          />
          <TextField label="Email on the account" name="email" type="email" autoComplete="email" />
          <TextField label="Shop ID" name="shopCode" inputMode="numeric" optional hint="Only for shop staff." />
          <FormMessage state={state} />
          <SubmitButton block>Email me a code</SubmitButton>
        </>
      ) : (
        <>
          <input type="hidden" name="step" value="confirm" />
          <input type="hidden" name="token" value={state.token} />
          <FormMessage state={state} />
          <TextField label="6-digit code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} />
          <TextField label="New password" name="password" type="password" autoComplete="new-password" hint="At least 10 characters." />
          <SubmitButton block>Set new password</SubmitButton>
        </>
      )}
    </form>
  );
}
