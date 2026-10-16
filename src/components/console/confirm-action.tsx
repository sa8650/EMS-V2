'use client';

import type { ReactNode } from 'react';
import type { ActionState } from '@/lib/action-state';
import { Dialog, useCloseDialog } from '@/components/ui/dialog';
import { ActionForm } from '@/components/ui/form';

type ServerAction = (state: ActionState, form: FormData) => Promise<ActionState>;

function Body({ action, fields, message, confirmLabel, danger }: { action: ServerAction; fields: Record<string, string>; message: ReactNode; confirmLabel: string; danger: boolean }) {
  const close = useCloseDialog();
  return (
    <ActionForm action={action} submitLabel={confirmLabel} submitVariant={danger ? 'danger' : 'primary'} onSuccess={close}>
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <div>{message}</div>
    </ActionForm>
  );
}

/** A button that asks for confirmation in a dialog, then runs a Server Action. */
export function ConfirmAction({ label, title, message, action, fields, confirmLabel = 'Confirm', danger = true, size = 'small' }: {
  label: ReactNode;
  title: string;
  message: ReactNode;
  action: ServerAction;
  fields: Record<string, string>;
  confirmLabel?: string;
  danger?: boolean;
  size?: 'small' | 'default';
}) {
  return (
    <Dialog trigger={label} title={title} triggerVariant={danger ? 'ghost' : 'default'} triggerSize={size}>
      <Body action={action} fields={fields} message={message} confirmLabel={confirmLabel} danger={danger} />
    </Dialog>
  );
}
