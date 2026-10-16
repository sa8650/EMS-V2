'use client';

import { Dialog, useCloseDialog } from '@/components/ui/dialog';
import { ActionForm, FormGrid, SelectField, TextField } from '@/components/ui/form';
import { requestLicenceAction } from '../_actions/shops';

function RequestForm({ planId, instructions, priceLabel }: { planId: string; instructions: string | null; priceLabel: string }) {
  const close = useCloseDialog();
  return (
    <ActionForm action={requestLicenceAction} submitLabel="Send request" onSuccess={close}>
      <input type="hidden" name="plan_id" value={planId} />
      <p>
        Pay <strong>{priceLabel}</strong>, then enter the payment details. The licence is activated once the payment is confirmed.
      </p>
      {instructions && <p style={{ whiteSpace: 'pre-line', padding: 'var(--space-3)', borderRadius: 'var(--radius)', background: 'var(--surface-sunken)' }}>{instructions}</p>}
      <SelectField
        label="Paid with"
        name="payment_method"
        options={[
          { value: 'bkash', label: 'bKash' },
          { value: 'nagad', label: 'Nagad' },
          { value: 'bank', label: 'Bank transfer' },
          { value: 'other', label: 'Other' },
        ]}
      />
      <FormGrid>
        <TextField label="Paid from (number or account)" name="payment_number" autoComplete="off" />
        <TextField label="Transaction ID" name="transaction_id" autoComplete="off" />
      </FormGrid>
    </ActionForm>
  );
}

export function RequestPlanDialog({ planId, title, instructions, priceLabel }: { planId: string; title: string; instructions: string | null; priceLabel: string }) {
  return (
    <Dialog title={`Request ${title}`} trigger="Choose this plan">
      <RequestForm planId={planId} instructions={instructions} priceLabel={priceLabel} />
    </Dialog>
  );
}
