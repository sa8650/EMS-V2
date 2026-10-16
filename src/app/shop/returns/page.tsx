import { PackageX, RotateCcw } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/console/bento';
import { hrefWith } from '@/components/console/toolbar';
import { Button } from '@/components/ui/button';
import { Badge, Card, DataTable, EmptyState, Pagination, Tabs, tableStyles } from '@/components/ui/display';
import ui from '@/components/ui/ui.module.css';
import { formatDate, formatDateTime, formatMoney, formatNumber } from '@/lib/format';
import { can } from '@/lib/permissions';
import { requireShopView, type ShopContext } from '@/server/auth/guards';
import { PAGE_SIZE, pageOf } from '@/server/services/records';
import { CONDITIONS, listExchanges, listReturns, quarantine } from '@/server/services/returns';

export const metadata: Metadata = { title: 'Returns & exchanges' };

export default async function ReturnsPage({ searchParams }: { searchParams: Promise<{ tab?: string; page?: string }> }) {
  const params = await searchParams;
  const ctx = await requireShopView('returns_refunds');
  const tab = params.tab === 'exchanges' || params.tab === 'damaged' ? params.tab : 'returns';
  const page = pageOf(params.page);
  const canAdd = !ctx.readOnly && can(ctx.permissions, 'returns_refunds', 'add');
  return (
    <>
      <PageHeader title="Returns & exchanges" description="Start from the sale invoice. Sellable items go back to stock; damaged and defective ones are kept apart." />
      {canAdd && (
        <Card>
          <form method="get" action="/shop/returns/new" style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'end' }}>
            <label style={{ display: 'grid', gap: 'var(--space-1)', flex: '1 1 240px' }}>
              <span className={ui.label}>Sale invoice number</span>
              <input name="number" className={ui.control} placeholder="INV-000123" required autoComplete="off" />
            </label>
            <Button type="submit" variant="primary">Start return or exchange</Button>
          </form>
        </Card>
      )}
      <Tabs
        label="Returns"
        current={tab}
        items={[
          { key: 'returns', label: 'Returns', href: '/shop/returns' },
          { key: 'exchanges', label: 'Exchanges', href: '/shop/returns?tab=exchanges' },
          { key: 'damaged', label: 'Damaged & defective', href: '/shop/returns?tab=damaged' },
        ]}
      />
      <Card bodyless>
        {tab === 'returns' && <ReturnsTable shopId={ctx.shop.id} db={ctx.db} page={page} />}
        {tab === 'exchanges' && <ExchangesTable shopId={ctx.shop.id} db={ctx.db} page={page} />}
        {tab === 'damaged' && <DamagedTable shopId={ctx.shop.id} db={ctx.db} />}
      </Card>
    </>
  );
}

type Db = ShopContext['db'];

async function ReturnsTable({ db, shopId, page }: { db: Db; shopId: string; page: number }) {
  const { rows, total } = await listReturns(db, shopId, page);
  return (
    <>
      <DataTable
        caption="Returns"
        rows={rows}
        rowKey={(r) => r.id}
        empty={<EmptyState icon={RotateCcw} title="No returns yet" />}
        columns={[
          { key: 'number', header: 'Return', cell: (r) => <Link href={`/shop/returns/${r.id}`} className={tableStyles.mono}>{r.number}</Link> },
          { key: 'date', header: 'Date', cell: (r) => formatDate(r.return_date) },
          { key: 'invoice', header: 'Invoice', cell: (r) => <span className={tableStyles.mono}>{r.invoices?.number ?? '—'}</span> },
          { key: 'customer', header: 'Customer', cell: (r) => r.customer_name ?? <span className={tableStyles.muted}>Walk-in</span> },
          { key: 'total', header: 'Value', numeric: true, cell: (r) => formatMoney(r.total) },
          { key: 'refund', header: 'Refunded', numeric: true, cell: (r) => <>{formatMoney(r.refunded)} {r.status !== 'refunded' && <Badge tone="warning">{r.status.replace('_', ' ')}</Badge>}</> },
        ]}
      />
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} href={(p) => hrefWith('/shop/returns', {}, { page: p })} />
    </>
  );
}

async function ExchangesTable({ db, shopId, page }: { db: Db; shopId: string; page: number }) {
  const { rows, total } = await listExchanges(db, shopId, page);
  return (
    <>
      <DataTable
        caption="Exchanges"
        rows={rows}
        rowKey={(r) => r.id}
        empty={<EmptyState icon={RotateCcw} title="No exchanges yet" />}
        columns={[
          { key: 'number', header: 'Exchange', cell: (r) => <Link href={`/shop/returns/exchange/${r.id}`} className={tableStyles.mono}>{r.number}</Link> },
          { key: 'date', header: 'Date', cell: (r) => formatDate(r.exchange_date) },
          { key: 'invoice', header: 'Invoice', cell: (r) => <span className={tableStyles.mono}>{r.invoices?.number ?? '—'}</span> },
          { key: 'back', header: 'Came back', numeric: true, cell: (r) => formatMoney(r.returned_total) },
          { key: 'new', header: 'Replacement', numeric: true, cell: (r) => formatMoney(r.new_total) },
          { key: 'diff', header: 'Settlement', numeric: true, cell: (r) => (r.settlement === 'even' ? 'Even' : `${r.settlement === 'payment' ? 'Paid' : 'Refunded'} ${formatMoney(Math.abs(Number(r.difference)))}`) },
        ]}
      />
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} href={(p) => hrefWith('/shop/returns', { tab: 'exchanges' }, { page: p })} />
    </>
  );
}

async function DamagedTable({ db, shopId }: { db: Db; shopId: string }) {
  const rows = (await quarantine(db, shopId)) as unknown as { id: string; type: string; quantity: number; condition: string | null; notes: string | null; created_at: string; return_id: string | null; exchange_id: string | null; products: { code: string; name: string; unit: string } | null }[];
  return (
    <DataTable
      caption="Damaged and defective items"
      rows={rows}
      rowKey={(r) => r.id}
      empty={<EmptyState icon={PackageX} title="Nothing kept apart">Damaged or defective items that come back are listed here.</EmptyState>}
      columns={[
        { key: 'when', header: 'When', cell: (r) => formatDateTime(r.created_at) },
        { key: 'item', header: 'Item', cell: (r) => <><strong>{r.products?.name ?? '—'}</strong> <span className={tableStyles.muted}>{r.products?.code}</span></> },
        { key: 'qty', header: 'Qty', numeric: true, cell: (r) => `${formatNumber(r.quantity)} ${r.products?.unit ?? ''}` },
        { key: 'condition', header: 'Condition', cell: (r) => <Badge tone="danger">{CONDITIONS[r.condition as keyof typeof CONDITIONS] ?? r.condition}</Badge> },
        { key: 'reason', header: 'Reason', cell: (r) => r.notes ?? '—' },
        { key: 'source', header: 'From', cell: (r) => (r.return_id ? <Link href={`/shop/returns/${r.return_id}`}>Return</Link> : r.exchange_id ? <Link href={`/shop/returns/exchange/${r.exchange_id}`}>Exchange</Link> : '—') },
      ]}
    />
  );
}
