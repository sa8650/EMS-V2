import type { Metadata } from 'next';
import Link from 'next/link';
import { PageForm } from '../_components/forms';
import { PageHeader } from '@/components/console/bento';
import { Card, Tabs } from '@/components/ui/display';
import { formatDateTime } from '@/lib/format';
import { requireOwner } from '@/server/auth/guards';
import { allPages } from '@/server/services/platform';

export const metadata: Metadata = { title: 'Website pages' };

export default async function PagesPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const params = await searchParams;
  const { db } = await requireOwner();
  const pages = await allPages(db);
  const current = pages.find((p) => p.slug === params.page) ?? pages[0]!;
  return (
    <>
      <PageHeader title="Website pages" description="About, Terms, Privacy and the Contact page introduction. Empty pages show a short notice on the website." />
      <Tabs label="Pages" current={current.slug} items={pages.map((p) => ({ key: p.slug, label: p.title, href: `/owner/pages?page=${p.slug}` }))} />
      <Card title={current.title} actions={<Link href={`/${current.slug}`} target="_blank">View on website</Link>}>
        <PageForm key={current.slug} slug={current.slug} title={current.title} body={current.body} />
        {current.updated_at && <p style={{ color: 'var(--text-subtle)', fontSize: 'var(--text-xs)', marginTop: 'var(--space-3)' }}>Last saved {formatDateTime(current.updated_at)}</p>}
      </Card>
    </>
  );
}
