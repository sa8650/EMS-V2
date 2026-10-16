'use client';

import { Dialog, useCloseDialog } from '@/components/ui/dialog';
import { ActionForm, TextArea } from '@/components/ui/form';
import { reviewLicenceAction } from '../_actions/licensing';

function ReviewForm({ id, decision, summary }: { id: string; decision: 'active' | 'rejected'; summary: string }) {
  const close = useCloseDialog();
  return (
    <ActionForm action={reviewLicenceAction} submitLabel={decision === 'active' ? 'Activate licence' : 'Reject request'} submitVariant={decision === 'active' ? 'primary' : 'danger'} onSuccess={close}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="decision" value={decision} />
      <p>{summary}</p>
      <TextArea label="Note to the administrator" name="note" rows={2} optional />
    </ActionForm>
  );
}

export function ReviewButtons({ id, summary }: { id: string; summary: string }) {
  return (
    <span style={{ display: 'flex', gap: 'var(--space-1)', justifyContent: 'flex-end' }}>
      <Dialog title="Activate licence" trigger="Approve" triggerSize="small">
        <ReviewForm id={id} decision="active" summary={`${summary} Confirm that the payment has been received.`} />
      </Dialog>
      <Dialog title="Reject request" trigger="Reject" triggerSize="small" triggerVariant="ghost">
        <ReviewForm id={id} decision="rejected" summary={summary} />
      </Dialog>
    </span>
  );
}
