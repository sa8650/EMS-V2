import type { Metadata } from 'next';
import { InvoiceView } from '../../_components/invoice-view';

export const metadata: Metadata = { title: 'Purchase invoice' };

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const [{ id }, { created }] = await Promise.all([params, searchParams]);
  return <InvoiceView kind="purchase" id={id} created={created === '1'} />;
}
