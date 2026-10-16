'use client';

import { ActionForm, FormGrid, TextArea, TextField } from '@/components/ui/form';
import { changeAdminPasswordAction, saveProfileAction } from '../_actions/account';

export function ProfileForm({ name, phone, address }: { name: string; phone: string; address: string | null }) {
  return (
    <ActionForm action={saveProfileAction} submitLabel="Save profile">
      <FormGrid>
        <TextField label="Name" name="name" defaultValue={name} autoComplete="name" />
        <TextField label="Phone" name="phone" type="tel" defaultValue={phone} autoComplete="tel" />
      </FormGrid>
      <TextArea label="Address" name="address" rows={2} defaultValue={address ?? ''} optional />
    </ActionForm>
  );
}

export function PasswordForm({ action = changeAdminPasswordAction }: { action?: typeof changeAdminPasswordAction }) {
  return (
    <ActionForm action={action} submitLabel="Change password" resetOnSuccess>
      <FormGrid>
        <TextField label="Current password" name="current" type="password" autoComplete="current-password" />
        <TextField label="New password" name="password" type="password" autoComplete="new-password" hint="At least 10 characters." />
      </FormGrid>
    </ActionForm>
  );
}
