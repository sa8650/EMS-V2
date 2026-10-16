import type { Metadata } from 'next';
import { ReturnDocument } from '../document';

export const metadata: Metadata = { title: 'Return' };

export default async function ReturnPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const [{ id }, { created }] = await Promise.all([params, searchParams]);
  return <ReturnDocument id={id} created={created === '1'} />;
}
