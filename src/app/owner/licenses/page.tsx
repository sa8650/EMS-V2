import { ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';
import { PageHeader } from '@/components/console/bento';
import { hrefWith } from '@/components/console/toolbar';
import { Badge, Card, DataTable, EmptyState, Pagination, Tabs, tableStyles, type Tone } from '@/components/ui/display';
import { formatDate, formatMoney } from '@/lib/format';
import { requireOwner } from '@/server/auth/guards';
import { ownerLicences } from '@/server/services/licences';
import { pageOf } from '@/server/services/records';
import { ReviewButtons } from './forms';

export const metadata: Metadata = { title: 'Licence requests' };

const STATUS_TONE: Record<string, Tone> = { pending: 'warning', active: 'success', rejected: 'danger', expired: 'neutral' };
const STATUSES = ['pending', 'active', 'rejected', 'expired'];

export default async function OwnerLicencesPage({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  const params = await searchParams;
  const { db } = await requireOwner();
  const status = STATUSES.includes(params.status ?? '') ? params.status : undefined;
  const page = pageOf(params.page);
  const { rows, total } = await ownerLicences(db, { status, page });
  return (
    <>
      <PageHeader title="Licence requests" description="Confirm the payment, then approve. Approval sets the start and end dates automatically." />
      <Tabs
        label="Filter by status"
        current={status ?? 'all'}
        items={[{ key: 'all', label: 'All', href: '/owner/licenses' }, ...STATUSES.map((s) => ({ key: s, label: s[0]!.toUpperCase() + s.slice(1), href: `/owner/licenses?status=${s}` }))]}
      />
      <Card bodyless>
        <DataTable
          caption="Licences"
          rows={rows}
          rowKey={(r) => r.id}
          empty={<EmptyState icon={ShieldCheck} title={status === 'pending' ? 'Nothing waiting for review' : 'No licences here'} />}
          columns={[
            { key: 'admin', header: 'Administrator', cell: (r) => <><strong>{r.admins?.name ?? '—'}</strong><div className={tableStyles.muted}>{r.admins?.email} · code {r.admins?.admin_code}</div></> },
            { key: 'plan', header: 'Plan', cell: (r) => <>{r.title}<div className={tableStyles.muted}>{r.max_shops} shop{r.max_shops === 1 ? '' : 's'} · {r.duration_months} mo · {r.kind}</div></> },
            { key: 'amount', header: 'Amount', numeric: true, cell: (r) => formatMoney(r.amount) },
            { key: 'payment', header: 'Payment', cell: (r) => <>{r.payment_method}<div className={`${tableStyles.muted} ${tableStyles.mono}`}>{[r.payment_number, r.transaction_id].filter(Boolean).join(' · ')}</div></> },
            { key: 'period', header: 'Period', cell: (r) => (r.starts_at ? `${formatDate(r.starts_at)} – ${formatDate(r.expires_at)}` : <span className={tableStyles.muted}>Requested {formatDate(r.created_at)}</span>) },
            { key: 'status', header: 'Status', cell: (r) => <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge> },
            {
              key: 'actions',
              header: <span className="visually-hidden">Actions</span>,
              cell: (r) => (r.status === 'pending' ? <ReviewButtons id={r.id} summary={`${r.admins?.name ?? 'This administrator'} requested ${r.title} for ${formatMoney(r.amount)} (${r.payment_method}${r.transaction_id ? `, transaction ${r.transaction_id}` : ''}).`} /> : r.review_note ? <span className={tableStyles.muted}>{r.review_note}</span> : null),
            },
          ]}
        />
        <Pagination page={page} pageSize={25} total={total} href={(p) => hrefWith('/owner/licenses', { status }, { page: p })} />
      </Card>
    </>
  );
}
