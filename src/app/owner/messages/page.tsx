import { Inbox } from 'lucide-react';
import type { Metadata } from 'next';
import { setMessageStatusAction } from '../_actions/platform';
import { PageHeader } from '@/components/console/bento';
import { ConfirmAction } from '@/components/console/confirm-action';
import { Badge, Card, EmptyState, Tabs, type Tone } from '@/components/ui/display';
import { formatDateTime } from '@/lib/format';
import { requireOwner } from '@/server/auth/guards';
import { contactInbox } from '@/server/services/platform';

export const metadata: Metadata = { title: 'Contact messages' };

const TONE: Record<string, Tone> = { new: 'info', read: 'neutral', closed: 'success' };

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const params = await searchParams;
  const { db } = await requireOwner();
  const status = ['new', 'read', 'closed'].includes(params.status ?? '') ? params.status : undefined;
  const messages = await contactInbox(db, status);
  return (
    <>
      <PageHeader title="Contact messages" description="Messages sent from the website contact form. Reply by email." />
      <Tabs label="Filter" current={status ?? 'all'} items={[{ key: 'all', label: 'All', href: '/owner/messages' }, { key: 'new', label: 'New', href: '/owner/messages?status=new' }, { key: 'read', label: 'Read', href: '/owner/messages?status=read' }, { key: 'closed', label: 'Closed', href: '/owner/messages?status=closed' }]} />
      {messages.length ? messages.map((m) => (
        <Card key={m.id} title={m.subject ?? 'No subject'} actions={<Badge tone={TONE[m.status]}>{m.status}</Badge>}>
          <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{m.message}</p>
          <p style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
            {m.name} · <a href={`mailto:${m.email}?subject=${encodeURIComponent(`Re: ${m.subject ?? 'your message'}`)}`}>{m.email}</a>{m.phone ? ` · ${m.phone}` : ''} · {formatDateTime(m.created_at)}
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
            {m.status !== 'read' && <ConfirmAction label="Mark read" title="Mark as read?" message="Move this message to Read." confirmLabel="Mark read" danger={false} action={setMessageStatusAction} fields={{ id: m.id, status: 'read' }} />}
            {m.status !== 'closed' && <ConfirmAction label="Close" title="Close message?" message="Mark this message as handled." confirmLabel="Close" danger={false} action={setMessageStatusAction} fields={{ id: m.id, status: 'closed' }} />}
          </div>
        </Card>
      )) : <Card><EmptyState icon={Inbox} title="No messages here" /></Card>}
    </>
  );
}
