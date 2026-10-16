'use client';

import { ActionForm, TextArea } from '@/components/ui/form';
import { askZudoAction } from './actions';

export function AskForm({ conversation }: { conversation?: string }) {
  return (
    <ActionForm action={askZudoAction} submitLabel="Ask Zudo">
      {conversation && <input type="hidden" name="conversation" value={conversation} />}
      <TextArea label="Your question" name="question" rows={3} placeholder="e.g. Which products sold most this month? Who owes us the most?" />
    </ActionForm>
  );
}
