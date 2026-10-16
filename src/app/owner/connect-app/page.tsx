import { Link2 } from 'lucide-react';
import type { Metadata } from 'next';
import { approveRequestAction, cancelRequestAction, connectionStatusAction, pingConnectionAction } from '../_actions/connect';
import { Bento, KeyValues, PageHeader, Tile } from '@/components/console/bento';
import { ConfirmAction } from '@/components/console/confirm-action';
import { Badge, Card, DataTable, EmptyState, tableStyles, type Tone } from '@/components/ui/display';
import { formatDateTime } from '@/lib/format';
import { requireOwner } from '@/server/auth/guards';
import { connectOverview } from '@/server/connect-app/owner';
import { siteOrigin } from '@/server/site';
import { DispatchForm, EndpointForm, RequestForm } from './forms';

export const metadata: Metadata = { title: 'Connect App' };

const TONE: Record<string, Tone> = { ACTIVE: 'success', PAUSED: 'warning', DISCONNECTED: 'neutral', PENDING_APPROVAL: 'info', CONSUMED: 'success', FAILED: 'danger' };

export default async function ConnectAppPage() {
  const { db } = await requireOwner();
  const o = await connectOverview(db, await siteOrigin());
  const inbound = o.requests.filter((r) => r.direction === 'inbound' && r.status === 'PENDING_APPROVAL');
  return (
    <>
      <PageHeader title="Connect App" description="Pair this installation with the Connect App on an Android phone, which sends the shops’ SMS." />
      <Bento>
        <Tile span={12} title="This installation" icon={Link2} accent>
          <KeyValues items={[['Application ID', <span key="a" className="mono">{o.identity.application_id}</span>], ['Connect Endpoint', <span key="e" className="mono">{o.identity.connect_endpoint || '—'}</span>]]} />
        </Tile>
      </Bento>
      {inbound.length > 0 && (
        <Card title="Waiting for your approval" bodyless>
          <DataTable caption="Inbound requests" rows={inbound} rowKey={(r) => r.id} columns={[
            { key: 'app', header: 'App', cell: (r) => <><strong>{r.display_name ?? r.remote_application_name}</strong><div className={tableStyles.muted}>{r.remote_endpoint}</div></> },
            { key: 'code', header: 'Pairing code', cell: (r) => <span className={tableStyles.mono}>{r.pairing_code}</span> },
            { key: 'expires', header: 'Expires', cell: (r) => formatDateTime(r.expires_at) },
            { key: 'actions', header: <span className="visually-hidden">Actions</span>, cell: (r) => <span style={{ display: 'flex', gap: 'var(--space-1)', justifyContent: 'flex-end' }}><ConfirmAction label="Approve" title="Approve connection?" message={<>Only approve if the other app shows pairing code <strong className="mono">{r.pairing_code}</strong>.</>} confirmLabel="Approve" danger={false} action={approveRequestAction} fields={{ id: r.id }} /><ConfirmAction label="Decline" title="Decline request?" message="The other app can send a new request later." confirmLabel="Decline" action={cancelRequestAction} fields={{ id: r.id }} /></span> },
          ]} />
        </Card>
      )}
      <Card title="Connections" bodyless>
        <DataTable caption="Connections" rows={o.connections} rowKey={(c) => c.id} empty={<EmptyState icon={Link2} title="No connected apps" />} columns={[
          { key: 'app', header: 'App', cell: (c) => <><strong>{c.display_name ?? c.remote_application_name}</strong><div className={tableStyles.muted}>{c.remote_endpoint}</div></> },
          { key: 'perm', header: 'Permissions', cell: (c) => (Array.isArray(c.permissions) ? (c.permissions as string[]).join(', ') : '') },
          { key: 'seen', header: 'Last seen', cell: (c) => formatDateTime(c.last_seen_at) },
          { key: 'status', header: 'Status', cell: (c) => <Badge tone={TONE[c.status]}>{c.status.toLowerCase()}</Badge> },
          {
            key: 'actions', header: <span className="visually-hidden">Actions</span>,
            cell: (c) => (
              <span style={{ display: 'flex', gap: 'var(--space-1)', justifyContent: 'flex-end' }}>
                {c.status === 'ACTIVE' && <ConfirmAction label="Ping" title="Ping the app?" message="Checks that the other app answers." confirmLabel="Ping" danger={false} action={pingConnectionAction} fields={{ id: c.id }} />}
                {c.status === 'ACTIVE' && <ConfirmAction label="Pause" title="Pause connection?" message="SMS wait until the connection is active again." confirmLabel="Pause" danger={false} action={connectionStatusAction} fields={{ id: c.id, status: 'PAUSED' }} />}
                {c.status !== 'ACTIVE' && <ConfirmAction label="Activate" title="Activate connection?" message="SMS are sent through this app again." confirmLabel="Activate" danger={false} action={connectionStatusAction} fields={{ id: c.id, status: 'ACTIVE' }} />}
                {c.status !== 'DISCONNECTED' && <ConfirmAction label="Disconnect" title="Disconnect?" message="The other app is told to forget this pairing." confirmLabel="Disconnect" action={connectionStatusAction} fields={{ id: c.id, status: 'DISCONNECTED' }} />}
                <ConfirmAction label="Delete" title="Delete connection?" message="Removes the pairing record." confirmLabel="Delete" action={connectionStatusAction} fields={{ id: c.id, status: 'DELETED' }} />
              </span>
            ),
          },
        ]} />
      </Card>
      <Card title="Pair with an app"><RequestForm /></Card>
      <Card title="Recent SMS" bodyless>
        <DataTable caption="Recent SMS" rows={o.sms} rowKey={(r) => r.id} empty={<EmptyState title="No SMS yet" />} columns={[
          { key: 'id', header: 'Request', cell: (r) => <span className={tableStyles.mono}>{r.request_id ?? '—'}</span> },
          { key: 'to', header: 'To', cell: (r) => r.to_phone },
          { key: 'status', header: 'Status', cell: (r) => <>{r.status}{r.error && <div className={tableStyles.muted}>{r.error}</div>}</> },
          { key: 'when', header: 'Queued', cell: (r) => formatDateTime(r.created_at) },
        ]} />
      </Card>
      <Card title="Advanced"><EndpointForm value={o.identity.endpoint_override} /><DispatchForm /></Card>
    </>
  );
}
