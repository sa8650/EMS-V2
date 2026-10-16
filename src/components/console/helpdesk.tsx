import type { RowOf } from '@/server/db';
import { formatDateTime } from '@/lib/format';
import { EmptyState } from '@/components/ui/display';
import { MessageComposer } from './message-composer';
import type { ActionState } from '@/lib/action-state';
import s from './console.module.css';

/** A help desk conversation between an administrator and the platform owner. */
export function HelpdeskThread({ messages, viewer, action, hidden }: {
  messages: RowOf<'helpdesk_messages'>[];
  viewer: 'owner' | 'admin';
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  hidden?: Record<string, string>;
}) {
  return (
    <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
      {messages.length ? (
        <ol className={s.thread} aria-label="Messages">
          {messages.map((m) => (
            <li key={m.id} className={m.sender === viewer ? s.mine : s.theirs}>
              <p>{m.body}</p>
              <span>{m.sender === 'owner' ? 'Platform owner' : 'Administrator'} · {formatDateTime(m.created_at)}</span>
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState title="No messages yet">Write the first message below.</EmptyState>
      )}
      <MessageComposer action={action} hidden={hidden} />
    </div>
  );
}
