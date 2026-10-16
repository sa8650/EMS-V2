import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/console/bento';
import { Alert } from '@/components/ui/display';
import { formatDate, formatMoney } from '@/lib/format';
import { can } from '@/lib/permissions';
import { requireShopView } from '@/server/auth/guards';
import { productOptions } from '@/server/services/records';
import { returnableInvoice } from '@/server/services/returns';
import { ReturnEditor } from '../editor';

export const metadata: Metadata = { title: 'New return or exchange' };

export default async function NewReturnPage({ searchParams }: { searchParams: Promise<{ invoice?: string; number?: string }> }) {
  const params = await searchParams;
  const ctx = await requireShopView('returns_refunds');
  if (ctx.readOnly || !can(ctx.permissions, 'returns_refunds', 'add')) redirect('/shop/returns');
  let invoiceId = params.invoice;
  if (!invoiceId && params.number) {
    const found = await ctx.db.from('invoices').select('id').eq('shop_id', ctx.shop.id).eq('kind', 'sale').eq('number', params.number.trim().toUpperCase()).maybeSingle();
    invoiceId = found?.id;
  }
  if (!invoiceId || !/^[0-9a-f-]{36}$/i.test(invoiceId)) {
    return (
      <>
        <PageHeader title="New return or exchange" />
        <Alert tone="warning">No sale invoice {params.number ? <strong>{params.number}</strong> : ''} was found in this shop. <Link href="/shop/returns">Try another number</Link>.</Alert>
      </>
    );
  }
  const [{ invoice, lines }, products] = await Promise.all([returnableInvoice(ctx.db, ctx.shop.id, invoiceId), productOptions(ctx.db, ctx.shop.id)]);
  const open = lines.filter((l) => l.returnable > 0);
  return (
    <>
      <PageHeader title={`Return or exchange — ${invoice.number}`} description={`${invoice.party_name ?? 'Walk-in customer'} · ${formatDate(invoice.invoice_date)} · ${formatMoney(invoice.total)}`} />
      {open.length ? (
        <ReturnEditor
          invoiceId={invoice.id}
          invoiceTax={Number(invoice.tax_percent)}
          lines={lines.map((l) => ({ id: l.id, product_name: l.product_name, code: l.code, quantity: Number(l.quantity), unit_price: Number(l.unit_price), tax_percent: Number(l.tax_percent), discount: Number(l.discount), returnable: l.returnable }))}
          products={products.map((p) => ({ ...p, sale_price: Number(p.sale_price), stock: Number(p.stock) }))}
        />
      ) : (
        <Alert tone="info">Everything on this invoice has already been returned or exchanged.</Alert>
      )}
    </>
  );
}
