import { Mail, MessageSquare } from 'lucide-react';
import type { Metadata } from 'next';
import { Bento, PageHeader, Tile } from '@/components/console/bento';
import { ConfirmAction } from '@/components/console/confirm-action';
import { Alert, Badge, Card, DataTable, EmptyState, Stat, Tabs, tableStyles, type Tone } from '@/components/ui/display';
import { formatDateTime } from '@/lib/format';
import { can } from '@/lib/permissions';
import { requireShopView, type ShopContext } from '@/server/auth/guards';
import { emailHistory, smsHistory, smsSettingsFor } from '@/server/connectx/email';
import { connectxRemaining } from '@/server/connectx/sms';
import { connectGatewayStatus } from '@/server/connect-app/service';
import { cancelSmsAction, hideEmailAction } from './actions';
import { EmailForm, SmsForm, SmsSettingsForm } from './forms';

export const metadata: Metadata = { title: 'ConnectX' };

const TONE: Record<string, Tone> = { queued: 'info', sending: 'info', sent: 'success', failed: 'danger', cancelled: 'neutral' };

export default async function ConnectXPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const params = await searchParams;
  const ctx = await requireShopView('connectx');
  const tab = params.tab === 'sms' || params.tab === 'settings' ? params.tab : 'email';
  const [quota, gateway] = await Promise.all([connectxRemaining(ctx.db, ctx.shop), connectGatewayStatus(ctx.db)]);
  const canSend = !ctx.readOnly && !!quota && can(ctx.permissions, 'connectx', 'send');
  const canDelete = !ctx.readOnly && can(ctx.permissions, 'connectx', 'delete');
  return (
    <>
      <PageHeader title="ConnectX" description="Email customers and suppliers, and send SMS through the shop’s paired phone." />
      {!quota && <Alert tone="info">ConnectX is not active for this shop. It comes with some licence plans or as an add-on.</Alert>}
      <Bento>
        <Tile span={4} title="Today" icon={Mail} accent>
          <Stat label="Messages sent" value={quota ? `${quota.used} / ${quota.limit}` : '—'} note="Email and SMS together" />
        </Tile>
        <Tile span={4} title="SMS gateway" icon={MessageSquare}>
          <Stat label="Connect App" value={gateway.configured ? (gateway.online ? 'Online' : 'Paired, offline') : 'Not paired'} note={gateway.configured ? `Last seen ${formatDateTime(gateway.lastSeen)}` : 'The platform owner pairs the phone'} />
        </Tile>
      </Bento>
      <Tabs label="ConnectX" current={tab} items={[{ key: 'email', label: 'Email', href: '/shop/connectx' }, { key: 'sms', label: 'SMS', href: '/shop/connectx?tab=sms' }, ...(can(ctx.permissions, 'settings', 'edit') ? [{ key: 'settings', label: 'SMS settings', href: '/shop/connectx?tab=settings' }] : [])]} />
      {tab === 'email' && <EmailTab ctx={ctx} canSend={canSend} canDelete={canDelete} />}
      {tab === 'sms' && <SmsTab ctx={ctx} canSend={canSend} canDelete={canDelete} />}
      {tab === 'settings' && can(ctx.permissions, 'settings', 'edit') && (
        <Card title="SMS settings">
          <SmsSettingsForm settings={await smsSettingsFor(ctx.db, ctx.shop.id)} />
        </Card>
      )}
    </>
  );
}

type Ctx = ShopContext;

async function EmailTab({ ctx, canSend, canDelete }: { ctx: Ctx; canSend: boolean; canDelete: boolean }) {
  const [history, customers, suppliers] = await Promise.all([
    emailHistory(ctx.db, ctx.shop.id),
    ctx.db.from('customers').select('id,name,email').eq('shop_id', ctx.shop.id).neq('email', '').order('name').limit(500),
    ctx.db.from('suppliers').select('id,name,email').eq('shop_id', ctx.shop.id).neq('email', '').order('name').limit(500),
  ]);
  const recipients = [...customers.filter((c) => c.email).map((c) => ({ value: `customer:${c.id}`, label: `Customer — ${c.name} (${c.email})` })), ...suppliers.filter((s) => s.email).map((s) => ({ value: `supplier:${s.id}`, label: `Supplier — ${s.name} (${s.email})` }))];
  return (
    <>
      {canSend && <Card title="New email"><EmailForm recipients={recipients} /></Card>}
      <Card title="Sent emails" bodyless>
        <DataTable caption="Sent emails" rows={history} rowKey={(r) => r.id} empty={<EmptyState icon={Mail} title="No emails yet" />} columns={[
          { key: 'when', header: 'When', cell: (r) => formatDateTime(r.created_at) },
          { key: 'subject', header: 'Subject', cell: (r) => <strong>{r.subject}</strong> },
          { key: 'to', header: 'To', cell: (r) => (Array.isArray(r.to_emails) ? (r.to_emails as string[]).join(', ') : '') },
          { key: 'status', header: 'Status', cell: (r) => <><Badge tone={TONE[r.status]}>{r.status}</Badge>{r.error && <div className={tableStyles.muted}>{r.error}</div>}</> },
          { key: 'actions', header: <span className="visually-hidden">Actions</span>, cell: (r) => (canDelete ? <ConfirmAction label="Remove" title="Remove from list?" message="The email stays in the platform records." confirmLabel="Remove" action={hideEmailAction} fields={{ id: r.id }} /> : null) },
        ]} />
      </Card>
    </>
  );
}

async function SmsTab({ ctx, canSend, canDelete }: { ctx: Ctx; canSend: boolean; canDelete: boolean }) {
  const history = await smsHistory(ctx.db, ctx.shop.id);
  return (
    <>
      {canSend && <Card title="New SMS"><SmsForm /></Card>}
      <Card title="SMS" bodyless>
        <DataTable caption="SMS" rows={history} rowKey={(r) => r.id} empty={<EmptyState icon={MessageSquare} title="No SMS yet" />} columns={[
          { key: 'when', header: 'When', cell: (r) => formatDateTime(r.created_at) },
          { key: 'to', header: 'To', cell: (r) => <>{r.to_phone}{r.recipient_name && <div className={tableStyles.muted}>{r.recipient_name}</div>}</> },
          { key: 'body', header: 'Message', cell: (r) => <span title={r.body}>{r.body.length > 80 ? `${r.body.slice(0, 80)}…` : r.body}</span> },
          { key: 'status', header: 'Status', cell: (r) => <><Badge tone={TONE[r.status]}>{r.status}</Badge>{r.error && <div className={tableStyles.muted}>{r.error}</div>}</> },
          { key: 'actions', header: <span className="visually-hidden">Actions</span>, cell: (r) => (canDelete && (r.status === 'queued' || r.status === 'sending') ? <ConfirmAction label="Cancel" title="Cancel SMS?" message={`Cancel the SMS to ${r.to_phone}?`} confirmLabel="Cancel SMS" action={cancelSmsAction} fields={{ id: r.id }} /> : null) },
        ]} />
      </Card>
    </>
  );
}
