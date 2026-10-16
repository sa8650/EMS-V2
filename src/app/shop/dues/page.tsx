import { Coins } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Bento, PageHeader, Tile } from '@/components/console/bento';
import { Toolbar, hrefWith } from '@/components/console/toolbar';
import { Card, DataTable, EmptyState, Pagination, Stat, Tabs, tableStyles } from '@/components/ui/display';
import { round2 } from '@/lib/invoice-math';
import { formatDate, formatDateTime, formatMoney } from '@/lib/format';
import { can } from '@/lib/permissions';
import { requireShopView } from '@/server/auth/guards';
import { paymentHistory, payables, receivables, type DueRow } from '@/server/services/dues';
import { PAYMENT_LABELS } from '@/server/services/invoices';
import { PAGE_SIZE, pageOf } from '@/server/services/records';
import { PaymentDialog } from './forms';

export const metadata: Metadata = { title: 'Dues' };

const LINK: Record<DueRow['source'], (id: string) => string> = {
  sale: (id) => `/shop/sales/${id}`,
  purchase: (id) => `/shop/purchases/${id}`,
  expense: () => '/shop/expenses',
};

export default async function DuesPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; page?: string }> }) {
  const params = await searchParams;
  const ctx = await requireShopView('due_recover');
  const tab = params.tab === 'payable' || params.tab === 'history' ? params.tab : 'receivable';
  const canPay = !ctx.readOnly && can(ctx.permissions, 'due_recover', 'add');
  const [rec, pay] = await Promise.all([receivables(ctx.db, ctx.shop.id, tab === 'receivable' ? params.q : undefined), payables(ctx.db, ctx.shop.id, tab === 'payable' ? params.q : undefined)]);
  const sum = (rows: DueRow[]) => round2(rows.reduce((t, r) => t + r.due, 0));
  const page = pageOf(params.page);
  const history = tab === 'history' ? await paymentHistory(ctx.db, ctx.shop.id, page) : null;
  const rows = tab === 'receivable' ? rec : pay;

  return (
    <>
      <PageHeader title="Dues" description="Collect what customers owe and pay what you owe. Every payment is recorded." />
      <Bento>
        <Tile span={6} title="Customers owe you" icon={Coins} accent>
          <Stat label="Receivable" value={formatMoney(sum(rec))} note={`${rec.length} invoice${rec.length === 1 ? '' : 's'}`} />
        </Tile>
        <Tile span={6} title="You owe" icon={Coins}>
          <Stat label="Payable" value={formatMoney(sum(pay))} note={`${pay.length} purchase${pay.length === 1 ? '' : 's'} and expense${pay.length === 1 ? '' : 's'}`} />
        </Tile>
      </Bento>
      <Tabs
        label="Dues"
        current={tab}
        items={[
          { key: 'receivable', label: 'To collect', href: '/shop/dues' },
          { key: 'payable', label: 'To pay', href: '/shop/dues?tab=payable' },
          { key: 'history', label: 'Payment history', href: '/shop/dues?tab=history' },
        ]}
      />
      <Card bodyless>
        {history ? (
          <>
            <DataTable
              caption="Payment history"
              rows={history.rows}
              rowKey={(r) => r.id}
              empty={<EmptyState icon={Coins} title="No payments recorded yet" />}
              columns={[
                { key: 'when', header: 'When', cell: (r) => formatDateTime(r.created_at) },
                { key: 'type', header: 'Type', cell: (r) => (r.source_type === 'sale' ? 'Collected' : 'Paid') },
                { key: 'ref', header: 'For', cell: (r) => (r.ref ? <><span className={tableStyles.mono}>{r.ref.number}</span>{r.ref.label && <span className={tableStyles.muted}> · {r.ref.label}</span>}</> : '—') },
                { key: 'method', header: 'Method', cell: (r) => PAYMENT_LABELS[r.payment_method as keyof typeof PAYMENT_LABELS] ?? r.payment_method },
                { key: 'amount', header: 'Amount', numeric: true, cell: (r) => formatMoney(r.amount) },
              ]}
            />
            <Pagination page={page} pageSize={PAGE_SIZE} total={history.total} href={(p) => hrefWith('/shop/dues', { tab }, { page: p })} />
          </>
        ) : (
          <>
            <Toolbar q={params.q} placeholder="Search number, name or phone" hidden={{ tab: tab === 'payable' ? 'payable' : undefined }} />
            <DataTable
              caption={tab === 'receivable' ? 'Dues to collect' : 'Dues to pay'}
              rows={rows}
              rowKey={(r) => `${r.source}:${r.id}`}
              empty={<EmptyState icon={Coins} title={params.q ? 'No matching dues' : 'Nothing outstanding'} />}
              columns={[
                { key: 'number', header: 'Record', cell: (r) => <Link href={LINK[r.source](r.id)} className={tableStyles.mono}>{r.number}</Link> },
                { key: 'date', header: 'Date', cell: (r) => formatDate(r.date) },
                { key: 'party', header: tab === 'receivable' ? 'Customer' : 'Supplier / expense', cell: (r) => <>{r.party ?? <span className={tableStyles.muted}>—</span>}{r.phone && <div className={tableStyles.muted}>{r.phone}</div>}</> },
                { key: 'total', header: 'Total', numeric: true, cell: (r) => formatMoney(r.total) },
                { key: 'due', header: 'Due', numeric: true, cell: (r) => <strong>{formatMoney(r.due)}</strong> },
                { key: 'actions', header: <span className="visually-hidden">Actions</span>, cell: (r) => (canPay ? <PaymentDialog source={r.source} id={r.id} number={r.number} due={r.due} /> : null) },
              ]}
            />
          </>
        )}
      </Card>
    </>
  );
}
