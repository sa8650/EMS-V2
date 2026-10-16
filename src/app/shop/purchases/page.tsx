import type { Metadata } from 'next';
import { InvoiceList, type InvoiceListParams } from '../_components/invoice-list';

export const metadata: Metadata = { title: 'Purchases' };

export default function PurchasesPage({ searchParams }: { searchParams: Promise<InvoiceListParams> }) {
  return <InvoiceList kind="purchase" searchParams={searchParams} />;
}
