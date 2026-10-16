import { Package } from 'lucide-react';
import type { Metadata } from 'next';
import { PageHeader } from '@/components/console/bento';
import { ConfirmAction } from '@/components/console/confirm-action';
import { Toolbar, hrefWith } from '@/components/console/toolbar';
import { Badge, Card, DataTable, EmptyState, Pagination, Tabs, tableStyles } from '@/components/ui/display';
import { formatMoney, formatNumber } from '@/lib/format';
import { can } from '@/lib/permissions';
import { requireShopView } from '@/server/auth/guards';
import { PAGE_SIZE, listProducts, pageOf } from '@/server/services/records';
import { removeProductAction, restoreProductAction } from '../_actions/records';
import { ProductDialog } from '../_components/record-forms';

export const metadata: Metadata = { title: 'Inventory' };

type Params = { q?: string; page?: string; stock?: string; view?: string };

export default async function InventoryPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const ctx = await requireShopView('inventory');
  const stock = params.stock === 'low' || params.stock === 'out' ? params.stock : undefined;
  const inactive = params.view === 'inactive';
  const page = pageOf(params.page);
  const { rows, total } = await listProducts(ctx.db, ctx.shop.id, { q: params.q, page, stock, inactive, threshold: ctx.shop.low_stock_threshold });
  const writable = !ctx.readOnly;
  const canAdd = writable && can(ctx.permissions, 'inventory', 'add');
  const canEdit = writable && can(ctx.permissions, 'inventory', 'edit');
  const canDelete = writable && can(ctx.permissions, 'inventory', 'delete');
  const keep = { q: params.q, stock, view: params.view };
  const tab = inactive ? 'inactive' : stock ?? 'all';

  return (
    <>
      <PageHeader title="Inventory" description="Products and stock. Stock goes up with purchases and down with sales." />
      <Tabs
        label="Filter products"
        current={tab}
        items={[
          { key: 'all', label: 'All products', href: hrefWith('/shop/inventory', { q: params.q }, {}) },
          { key: 'low', label: `Low stock (≤ ${ctx.shop.low_stock_threshold})`, href: hrefWith('/shop/inventory', { q: params.q }, { stock: 'low' }) },
          { key: 'out', label: 'Out of stock', href: hrefWith('/shop/inventory', { q: params.q }, { stock: 'out' }) },
          { key: 'inactive', label: 'Deactivated', href: hrefWith('/shop/inventory', { q: params.q }, { view: 'inactive' }) },
        ]}
      />
      <Card bodyless>
        <Toolbar q={params.q} placeholder="Search name, code or category" hidden={{ stock, view: params.view }} actions={canAdd ? <ProductDialog /> : null} />
        <DataTable
          caption="Products"
          rows={rows}
          rowKey={(r) => r.id}
          empty={<EmptyState icon={Package} title={params.q || stock ? 'No matching products' : inactive ? 'No deactivated products' : 'No products yet'}>{!params.q && !stock && !inactive && canAdd ? 'Add products, then record a purchase to bring in stock.' : undefined}</EmptyState>}
          columns={[
            { key: 'code', header: 'Code', cell: (r) => <span className={tableStyles.mono}>{r.code}</span> },
            { key: 'name', header: 'Product', cell: (r) => <><strong>{r.name}</strong>{r.category && <span className={tableStyles.muted}> · {r.category}</span>}</> },
            { key: 'price', header: 'Sale price', numeric: true, cell: (r) => formatMoney(r.sale_price) },
            {
              key: 'stock',
              header: 'Stock',
              numeric: true,
              cell: (r) => (
                <Badge tone={Number(r.stock) <= 0 ? 'danger' : Number(r.stock) <= ctx.shop.low_stock_threshold ? 'warning' : 'neutral'}>
                  {formatNumber(r.stock)} {r.unit}
                </Badge>
              ),
            },
            {
              key: 'actions',
              header: <span className="visually-hidden">Actions</span>,
              cell: (r) => (
                <span style={{ display: 'flex', gap: 'var(--space-1)', justifyContent: 'flex-end' }}>
                  {inactive
                    ? canEdit && <ConfirmAction label="Restore" title="Restore product?" message={<>Make <strong>{r.name}</strong> available again?</>} confirmLabel="Restore" danger={false} action={restoreProductAction} fields={{ id: r.id }} />
                    : <>
                        {canEdit && <ProductDialog record={r} />}
                        {canDelete && (
                          <ConfirmAction label="Remove" title="Remove product?" message={<>Remove <strong>{r.name}</strong>? Products already on invoices are deactivated instead, so history stays complete.</>} confirmLabel="Remove" action={removeProductAction} fields={{ id: r.id }} />
                        )}
                      </>}
                </span>
              ),
            },
          ]}
        />
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} href={(p) => hrefWith('/shop/inventory', keep, { page: p })} />
      </Card>
    </>
  );
}
