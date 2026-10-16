import type { Metadata } from 'next';
import { PartyPage } from '../_components/party-page';

export const metadata: Metadata = { title: 'Customers' };

export default function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  return <PartyPage table="customers" searchParams={searchParams} />;
}
