import type { Metadata } from 'next';
import { PartyPage } from '../_components/party-page';

export const metadata: Metadata = { title: 'Suppliers' };

export default function SuppliersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  return <PartyPage table="suppliers" searchParams={searchParams} />;
}
