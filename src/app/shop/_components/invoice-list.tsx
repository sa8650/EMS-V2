import { ReceiptText } from 'lucide-react';
import Link from 'next/link';
import { Bento, PageHeader, Tile } from '@/components/console/bento';
import { Toolbar, hrefWith } from '@/components/console/toolbar';
import { ButtonLink } from '@/components/ui/button';
import { Alert, Badge, Card, DataTable, EmptyState, Pagination, Stat, Tabs, tableStyles } from '@/components/ui/display';
import ui from '@/components/ui/ui.module.css';
import { isYmd } from '@/lib/dates';
import { formatDate, formatMoney } from '@/lib/format';
import { can } from '@/lib/permissions';
import { requireShopView } from '@/server/auth/guards';
import { listInvoices, PAYMENT_LABELS, type InvoiceKind } from '@/server/services/invoices';
import { PAGE_SIZE, pageOf } from '@/server/services/records';

export type InvoiceListParams = { q?: string; page?: string; from?: string; to?: string; status?: string; deleted?: string };

export async function InvoiceList({ kind, searchParams }: { kind: InvoiceKind; searchParams: Promise<InvoiceListParams> }) {
  const params = await searchParams;
  const ctx = await requireShopView(kind === 'sale' ? 'sales' : 'purchase');
  const base = kind === 'sale' ? '/shop/sales' : '/shop/purchases';
  const from = isYmd(params.from) ? params.from : undefined;
  const to = isYmd(params.to) ? params.to : undefined;
  const due = params.status === 'due';
  const page = pageOf(params.page);
  const data = await listInvoices(ctx.db, ctx.shop.id, kind, { q: params.q, page, from, to, due });
  const canAdd = !ctx.readOnly && can(ctx.permissions, kind === 'sale' ? 'sales' : 'purchase', 'add');
  const keep = { q: params.q, from, to, status: params.status };
  const title = kind === 'sale' ? 'Sales' : 'Purchases';

  return (
    <>
      <PageHeader
        title={title}
        description={kind === 'sale' ? 'Sales invoices: stock goes out, money comes in.' : 'Purchase invoices: stock comes in from suppliers.'}
        actions={canAdd ? <ButtonLink href={`${base}/new`} variant="primary">{kind === 'sale' ? 'New sale' : 'New purchase'}</ButtonLink> : null}
      />
      {params.deleted && <Alert tone="success">The invoice was deleted and its stock movement reversed.</Alert>}
      <Bento>
        <Tile span={4} title={from || to ? 'In this period' : 'All time'} icon={ReceiptText} accent>
          <Stat label="Total" value={formatMoney(data.sum)} note={`${data.total} invoice${data.total === 1 ? '' : 's'}`} />
        </Tile>
        <Tile span={4} title={kind === 'sale' ? 'Customers owe' : 'You owe suppliers'}>
          <Stat label="Due" value={formatMoney(data.due)} note={<Link href={`/shop/dues${kind === 'purchase' ? '?tab=payable' : ''}`}>Go to Dues</Link>} />
        </Tile>
      </Bento>
      <Tabs
        label="Filter invoices"
        current={due ? 'due' : 'all'}
        items={[
          { key: 'all', label: 'All', href: hrefWith(base, { ...keep, status: undefined }, {}) },
          { key: 'due', label: 'With dues', href: hrefWith(base, keep, { status: 'due' }) },
        ]}
      />
      <Card bodyless>
        <Toolbar
          q={params.q}
          placeholder="Search number, name or phone"
          hidden={{ status: params.status }}
          filters={
            <>
              <input type="date" name="from" defaultValue={from} className={ui.control} aria-label="From date" style={{ maxWidth: 160 }} />
              <input type="date" name="to" defaultValue={to} className={ui.control} aria-label="To date" style={{ maxWidth: 160 }} />
            </>
          }
        />
        <DataTable
          caption={title}
          rows={data.rows}
          rowKey={(r) => r.id}
          empty={<EmptyState icon={ReceiptText} title="No invoices found" action={canAdd && !params.q ? <ButtonLink href={`${base}/new`} variant="primary">Create one</ButtonLink> : undefined} />}
          columns={[
            { key: 'number', header: 'Invoice', cell: (r) => <Link href={`${base}/${r.id}`} className={tableStyles.mono}><strong>{r.number}</strong></Link> },
            { key: 'date', header: 'Date', cell: (r) => formatDate(r.invoice_date) },
            { key: 'party', header: kind === 'sale' ? 'Customer' : 'Supplier', cell: (r) => r.party_name ?? <span className={tableStyles.muted}>{kind === 'sale' ? 'Walk-in' : '—'}</span> },
            { key: 'method', header: 'Paid by', cell: (r) => PAYMENT_LABELS[r.payment_method as keyof typeof PAYMENT_LABELS] ?? r.payment_method },
            { key: 'total', header: 'Total', numeric: true, cell: (r) => formatMoney(r.total) },
            { key: 'due', header: 'Due', numeric: true, cell: (r) => (Number(r.due) > 0 ? <Badge tone="warning">{formatMoney(r.due)}</Badge> : <Badge tone="success">Paid</Badge>) },
          ]}
        />
        <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} href={(p) => hrefWith(base, keep, { page: p })} />
      </Card>
    </>
  );
}
