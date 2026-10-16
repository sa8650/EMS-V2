import { BarChart3, Coins, RotateCcw, ShoppingCart, TrendingUp, Wallet } from 'lucide-react';
import type { Metadata } from 'next';
import { Bento, MiniBars, PageHeader, Tile } from '@/components/console/bento';
import { PrintButton } from '@/components/console/print-button';
import { Button } from '@/components/ui/button';
import { DataTable, EmptyState, Stat } from '@/components/ui/display';
import ui from '@/components/ui/ui.module.css';
import { isYmd, monthRange, today } from '@/lib/dates';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import { requireShopView } from '@/server/auth/guards';
import { periodReport } from '@/server/services/reports';

export const metadata: Metadata = { title: 'Reports' };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const params = await searchParams;
  const ctx = await requireShopView('report');
  const month = monthRange(today());
  const from = isYmd(params.from) ? params.from : month.from;
  const to = isYmd(params.to) && params.to >= from ? params.to : month.to;
  const r = await periodReport(ctx.db, ctx.shop.id, from, to);
  return (
    <>
      <PageHeader
        title="Reports"
        description={`${ctx.shop.name} · ${formatDate(from)} – ${formatDate(to)}`}
        actions={
          <>
            <form method="get" style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              <input type="date" name="from" defaultValue={from} className={ui.control} aria-label="From" />
              <input type="date" name="to" defaultValue={to} className={ui.control} aria-label="To" />
              <Button type="submit">Show</Button>
            </form>
            <PrintButton />
          </>
        }
      />
      <Bento>
        <Tile span={4} title="Sales" icon={TrendingUp} accent>
          <Stat label="Invoiced" value={formatMoney(r.sales.total)} note={`${r.sales.count} invoices · ${formatMoney(r.sales.due)} still due`} />
        </Tile>
        <Tile span={4} title="Returns & exchanges" icon={RotateCcw}>
          <Stat label="Returned value" value={formatMoney(r.returns.value)} note={`${r.returns.count} returns · ${formatMoney(r.returns.refunded)} refunded · exchanges net ${formatMoney(r.exchanges.net)}`} />
        </Tile>
        <Tile span={4} title="Net sales" icon={BarChart3}>
          <Stat label="Sales − returns ± exchanges" value={formatMoney(r.netSales)} />
        </Tile>
        <Tile span={4} title="Purchases" icon={ShoppingCart}>
          <Stat label="Bought" value={formatMoney(r.purchases.total)} note={`${r.purchases.count} invoices · ${formatMoney(r.purchases.due)} still owed`} />
        </Tile>
        <Tile span={4} title="Expenses" icon={Wallet}>
          <Stat label="Spent" value={formatMoney(r.expenses.total)} note={`${r.expenses.count} expenses`} />
        </Tile>
        <Tile span={4} title="Due payments" icon={Coins}>
          <Stat label="Collected from customers" value={formatMoney(r.collected)} note={`Paid out to suppliers and expenses: ${formatMoney(r.paidOut)}`} />
        </Tile>
        {r.trend.length > 0 && (
          <Tile span={8} title="Daily sales">
            <MiniBars data={r.trend.map((t) => ({ label: formatDate(t.date), value: t.total }))} format={formatMoney} />
          </Tile>
        )}
        <Tile span={r.trend.length ? 4 : 12} title="Top products" flush>
          <DataTable
            caption="Top products"
            rows={r.topProducts}
            rowKey={(p) => p.name}
            empty={<EmptyState icon={BarChart3} title="No sales in this period" />}
            columns={[
              { key: 'name', header: 'Product', cell: (p) => p.name },
              { key: 'qty', header: 'Qty', numeric: true, cell: (p) => formatNumber(p.qty) },
              { key: 'amount', header: 'Sales', numeric: true, cell: (p) => formatMoney(p.amount) },
            ]}
          />
        </Tile>
      </Bento>
    </>
  );
}
