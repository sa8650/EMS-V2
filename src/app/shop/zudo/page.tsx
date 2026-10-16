import { Sparkles } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader, consoleStyles } from '@/components/console/bento';
import { ConfirmAction } from '@/components/console/confirm-action';
import cs from '@/components/console/console.module.css';
import { Alert, Card, EmptyState } from '@/components/ui/display';
import { formatDateTime } from '@/lib/format';
import { can } from '@/lib/permissions';
import { requireShopView } from '@/server/auth/guards';
import { getEnv } from '@/server/env';
import { aiStatus, conversationMessages, conversations } from '@/server/services/ai-addons';
import { deleteConversationAction } from './actions';
import { AskForm } from './ask-form';

export const metadata: Metadata = { title: 'Zudo AI' };

export default async function ZudoPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  const ctx = await requireShopView('zudo');
  const [status, list] = await Promise.all([aiStatus(ctx.db, await getEnv(), ctx.shop, 'zudo'), conversations(ctx.db, ctx.shop.id, ctx.actor.id)]);
  const open = c && /^[0-9a-f-]{36}$/i.test(c) ? await conversationMessages(ctx.db, ctx.shop.id, ctx.actor.id, c) : null;
  const canAsk = status.active && status.configured && can(ctx.permissions, 'zudo', 'send');
  return (
    <>
      <PageHeader title="Zudo AI" description={status.active ? `Ask about your shop in plain language. ${status.used} of ${status.limit} questions used today.` : 'A read-only assistant that answers from your shop data.'} />
      {!status.active && <Alert tone="info">Zudo AI is not active for this shop{status.enabled ? '' : ' (switched off by the platform owner)'}. It comes with some licence plans or as an add-on.</Alert>}
      {status.active && !status.configured && <Alert tone="warning">The AI provider is not configured yet. The platform owner needs to set it up.</Alert>}
      <div style={{ display: 'grid', gap: 'var(--space-4)', gridTemplateColumns: 'minmax(200px, 280px) minmax(0, 1fr)' }}>
        <Card title="Conversations" actions={<Link href="/shop/zudo">New</Link>}>
          {list.length ? (
            <ul className={consoleStyles.list}>
              {list.map((x) => (
                <li key={x.id}>
                  <Link href={`/shop/zudo?c=${x.id}`} aria-current={x.id === open?.conv.id ? 'page' : undefined}>{x.title}</Link>
                  {can(ctx.permissions, 'zudo', 'delete') && <ConfirmAction label="Delete" title="Delete conversation?" message={`Delete “${x.title}”?`} confirmLabel="Delete" action={deleteConversationAction} fields={{ id: x.id }} />}
                </li>
              ))}
            </ul>
          ) : <EmptyState icon={Sparkles} title="No conversations yet" />}
        </Card>
        <Card title={open?.conv.title ?? 'New conversation'}>
          {open && (
            <ol className={cs.thread} aria-label="Conversation">
              {open.messages.map((m) => (
                <li key={m.id} className={m.role === 'user' ? cs.mine : cs.theirs}>
                  <p>{m.content}</p>
                  <span>{m.role === 'user' ? 'You' : 'Zudo'} · {formatDateTime(m.created_at)}</span>
                </li>
              ))}
            </ol>
          )}
          {canAsk ? <AskForm conversation={open?.conv.id} /> : !open && <EmptyState icon={Sparkles} title="Zudo is not available" />}
        </Card>
      </div>
    </>
  );
}
