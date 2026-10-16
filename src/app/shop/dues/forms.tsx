'use client';

import { Dialog, useCloseDialog } from '@/components/ui/dialog';
import { ActionForm, FormGrid, SelectField, TextField } from '@/components/ui/form';
import { recordPaymentAction } from './actions';

const METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bkash', label: 'bKash' },
  { value: 'nagad', label: 'Nagad' },
  { value: 'bank', label: 'Bank' },
  { value: 'other', label: 'Other' },
];

function PaymentForm({ source, id, number, due }: { source: string; id: string; number: string; due: number }) {
  const close = useCloseDialog();
  return (
    <ActionForm action={recordPaymentAction} submitLabel="Record payment" onSuccess={close}>
      <input type="hidden" name="source_type" value={source} />
      <input type="hidden" name="source_id" value={id} />
      <p>
        <strong>{number}</strong> — {due.toFixed(2)} due.
      </p>
      <FormGrid>
        <TextField label="Amount (৳)" name="amount" type="number" min="0.01" step="0.01" max={due} defaultValue={due.toFixed(2)} />
        <SelectField label="Method" name="payment_method" options={METHODS} />
      </FormGrid>
      <FormGrid>
        <TextField label="Transaction ID" name="transaction_id" optional autoComplete="off" />
        <TextField label="Note" name="note" optional autoComplete="off" />
      </FormGrid>
    </ActionForm>
  );
}

export function PaymentDialog({ source, id, number, due }: { source: 'sale' | 'purchase' | 'expense'; id: string; number: string; due: number }) {
  return (
    <Dialog title={source === 'sale' ? `Collect due on ${number}` : `Pay due on ${number}`} trigger={source === 'sale' ? 'Collect' : 'Pay'} triggerSize="small">
      <PaymentForm source={source} id={id} number={number} due={due} />
    </Dialog>
  );
}
