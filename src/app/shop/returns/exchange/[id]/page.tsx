import type { Metadata } from 'next';
import { ExchangeDocument } from '../../document';

export const metadata: Metadata = { title: 'Exchange' };

export default async function ExchangePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const [{ id }, { created }] = await Promise.all([params, searchParams]);
  return <ExchangeDocument id={id} created={created === '1'} />;
}
