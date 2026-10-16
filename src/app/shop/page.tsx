import { AlertTriangle, BellRing, CalendarDays, Coins, PackageSearch, ReceiptText, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { Bento, MiniBars, PageHeader, Tile, consoleStyles } from '@/components/console/bento';
import { ButtonLink } from '@/components/ui/button';
import { Alert, Badge, EmptyState, Stat } from '@/components/ui/display';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import { can } from '@/lib/permissions';
import { requireShop } from '@/server/auth/guards';
import { shopAttention } from '@/server/services/attention';
import { shopDashboard } from '@/server/services/overview';
import { AttentionList } from '@/components/console/attention';

export default async function ShopDashboardPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const [{ db, shop, permissions, readOnly }, { denied }] = await Promise.all([requireShop(), searchParams]);
  const [d, notes] = await Promise.all([shopDashboard(db, shop), shopAttention(db, shop)]);
  const canSell = can(permissions, 'sales', 'add') && !readOnly;
  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`${shop.name} at a glance.`}
        actions={
          <>
            {canSell && <ButtonLink href="/shop/sales/new" variant="primary">New sale</ButtonLink>}
            {can(permissions, 'purchase', 'add') && !readOnly && <ButtonLink href="/shop/purchases/new">New purchase</ButtonLink>}
          </>
        }
      />
      {denied && <Alert tone="warning">You do not have access to that page. Ask your shop administrator if you need it.</Alert>}
      <Bento>
        <Tile span={3} title="Today" icon={CalendarDays} accent>
          <Stat label="Sales" value={formatMoney(d.today.total)} note={`${d.today.count} invoice${d.today.count === 1 ? '' : 's'}`} />
        </Tile>
        <Tile span={3} title="This month" icon={TrendingUp}>
          <Stat label="Sales" value={formatMoney(d.month.sales)} note={`Purchases ${formatMoney(d.month.purchases)} · Expenses ${formatMoney(d.month.expenses)}`} />
        </Tile>
        <Tile span={3} title="To collect" icon={Coins}>
          <Stat label="Customer dues" value={formatMoney(d.receivable)} note={can(permissions, 'due_recover', 'view') ? <Link href="/shop/dues">Collect dues</Link> : undefined} />
        </Tile>
        <Tile span={3} title="To pay" icon={Coins}>
          <Stat label="Supplier & expense dues" value={formatMoney(d.payable)} note={can(permissions, 'due_recover', 'view') ? <Link href="/shop/dues?tab=payable">Pay dues</Link> : undefined} />
        </Tile>

        <Tile span={8} title="Sales, last 14 days" icon={TrendingUp}>
          <MiniBars data={d.trend.map((t) => ({ label: formatDate(t.date), value: t.total }))} format={formatMoney} />
        </Tile>
        <Tile span={4} title="Low stock" icon={AlertTriangle} action={can(permissions, 'inventory', 'view') ? <ButtonLink href="/shop/inventory?stock=low" size="small">Inventory</ButtonLink> : undefined}>
          {d.lowStock.length ? (
            <ul className={consoleStyles.list}>
              {d.lowStock.map((p) => (
                <li key={p.id}>
                  <span>{p.name}</span>
                  <Badge tone={Number(p.stock) <= 0 ? 'danger' : 'warning'}>
                    {formatNumber(p.stock)} {p.unit}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={PackageSearch} title={d.activeProducts ? 'Stock levels look fine' : 'No products yet'}>
              {d.activeProducts ? `Nothing at or below ${shop.low_stock_threshold}.` : 'Add products in Inventory.'}
            </EmptyState>
          )}
        </Tile>

        <Tile span={5} title="Needs attention" icon={BellRing}>
          <AttentionList notes={notes.filter((n) => !n.section || can(permissions, n.section, 'view'))} />
        </Tile>
        <Tile span={7} title="Latest invoices" icon={ReceiptText}>
          {d.recent.length ? (
            <ul className={consoleStyles.list}>
              {d.recent.map((inv) => {
                const party = (inv as unknown as { customers?: { name: string } | null; suppliers?: { name: string } | null });
                return (
                  <li key={inv.id}>
                    <span>
                      {can(permissions, inv.kind === 'sale' ? 'sales' : 'purchase', 'view') ? (
                        <Link href={`/shop/${inv.kind === 'sale' ? 'sales' : 'purchases'}/${inv.id}`}>
                          <strong className="mono">{inv.number}</strong>
                        </Link>
                      ) : (
                        <strong className="mono">{inv.number}</strong>
                      )}{' '}
                      · {party.customers?.name ?? party.suppliers?.name ?? inv.party_name ?? (inv.kind === 'sale' ? 'Walk-in customer' : 'Supplier')} · {formatDate(inv.invoice_date)}
                    </span>
                    <span>
                      {Number(inv.due) > 0 && <Badge tone="warning">Due {formatMoney(inv.due)}</Badge>} {formatMoney(inv.total)}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState icon={ReceiptText} title="No invoices yet" action={canSell ? <ButtonLink href="/shop/sales/new" variant="primary">Create the first sale</ButtonLink> : undefined} />
          )}
        </Tile>
      </Bento>
    </>
  );
}
