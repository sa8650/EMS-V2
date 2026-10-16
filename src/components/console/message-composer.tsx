'use client';

import type { ActionState } from '@/lib/action-state';
import { ActionForm, TextArea } from '@/components/ui/form';

export function MessageComposer({ action, hidden = {} }: { action: (state: ActionState, form: FormData) => Promise<ActionState>; hidden?: Record<string, string> }) {
  return (
    <ActionForm action={action} submitLabel="Send" resetOnSuccess>
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <TextArea label="Message" name="body" rows={3} />
    </ActionForm>
  );
}
