import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/console/bento';
import { today } from '@/lib/dates';
import { can } from '@/lib/permissions';
import { requireShopView } from '@/server/auth/guards';
import { partyOptions } from '@/server/services/invoices';
import { productOptions } from '@/server/services/records';
import { InvoiceEditor } from '../../_components/invoice-editor';

export const metadata: Metadata = { title: 'New purchase' };

export default async function NewPurchasePage() {
  const ctx = await requireShopView('purchase');
  if (ctx.readOnly || !can(ctx.permissions, 'purchase', 'add')) redirect('/shop/purchases');
  const [products, parties] = await Promise.all([productOptions(ctx.db, ctx.shop.id), partyOptions(ctx.db, ctx.shop.id, 'purchase')]);
  return (
    <>
      <PageHeader title="New purchase" description="Stock is added when you save." />
      <InvoiceEditor
        kind="purchase"
        products={products.map((p) => ({ ...p, sale_price: Number(p.sale_price), stock: Number(p.stock) }))}
        parties={parties}
        defaultDate={today()}
      />
    </>
  );
}
