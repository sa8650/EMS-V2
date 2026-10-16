import { LifeBuoy } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { sendOwnerMessageAction } from '../_actions/platform';
import { PageHeader, consoleStyles } from '@/components/console/bento';
import { HelpdeskThread } from '@/components/console/helpdesk';
import { Badge, Card, EmptyState } from '@/components/ui/display';
import { formatDateTime } from '@/lib/format';
import { requireOwner } from '@/server/auth/guards';
import { conversation, helpdeskThreads } from '@/server/services/platform';

export const metadata: Metadata = { title: 'Help desk' };

export default async function OwnerHelpdeskPage({ searchParams }: { searchParams: Promise<{ admin?: string }> }) {
  const params = await searchParams;
  const { db } = await requireOwner();
  const threads = await helpdeskThreads(db);
  const adminId = params.admin && /^[0-9a-f-]{36}$/i.test(params.admin) ? params.admin : threads[0]?.adminId;
  const admin = adminId ? await db.from('admins').select('id,name,email').eq('id', adminId).maybeSingle() : null;
  const messages = admin ? await conversation(db, admin.id, 'owner') : [];
  return (
    <>
      <PageHeader title="Help desk" description="Conversations with administrators." />
      <div style={{ display: 'grid', gap: 'var(--space-4)', gridTemplateColumns: 'minmax(220px, 320px) minmax(0, 1fr)' }}>
        <Card title="Conversations">
          {threads.length ? (
            <ul className={consoleStyles.list}>
              {threads.map((t) => (
                <li key={t.adminId}>
                  <Link href={`/owner/helpdesk?admin=${t.adminId}`} aria-current={t.adminId === adminId ? 'page' : undefined}>
                    <strong>{t.admin?.name ?? 'Former administrator'}</strong>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-subtle)' }}>{formatDateTime(t.at)}</div>
                  </Link>
                  {t.unread > 0 && <Badge tone="info">{t.unread}</Badge>}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={LifeBuoy} title="No conversations yet" />
          )}
        </Card>
        <Card title={admin ? `${admin.name} · ${admin.email}` : 'Conversation'}>
          {admin ? <HelpdeskThread messages={messages} viewer="owner" action={sendOwnerMessageAction} hidden={{ admin_id: admin.id }} /> : <EmptyState title="Choose a conversation" />}
        </Card>
      </div>
    </>
  );
}
