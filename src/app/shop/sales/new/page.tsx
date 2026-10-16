import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/console/bento';
import { today } from '@/lib/dates';
import { can } from '@/lib/permissions';
import { requireShopView } from '@/server/auth/guards';
import { partyOptions } from '@/server/services/invoices';
import { productOptions } from '@/server/services/records';
import { InvoiceEditor } from '../../_components/invoice-editor';

export const metadata: Metadata = { title: 'New sale' };

export default async function NewSalePage() {
  const ctx = await requireShopView('sales');
  if (ctx.readOnly || !can(ctx.permissions, 'sales', 'add')) redirect('/shop/sales');
  const [products, parties] = await Promise.all([productOptions(ctx.db, ctx.shop.id), partyOptions(ctx.db, ctx.shop.id, 'sale')]);
  return (
    <>
      <PageHeader title="New sale" description="Stock is taken out when you save." />
      <InvoiceEditor
        kind="sale"
        products={products.map((p) => ({ ...p, sale_price: Number(p.sale_price), stock: Number(p.stock) }))}
        parties={parties}
        defaultDate={today()}
      />
    </>
  );
}
