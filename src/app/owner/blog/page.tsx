import { Rss } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { deletePostAction } from '../_actions/platform';
import { PostDialog } from '../_components/forms';
import { PageHeader } from '@/components/console/bento';
import { ConfirmAction } from '@/components/console/confirm-action';
import { Badge, Card, DataTable, EmptyState } from '@/components/ui/display';
import { formatDate } from '@/lib/format';
import { requireOwner } from '@/server/auth/guards';
import { allPosts } from '@/server/services/platform';

export const metadata: Metadata = { title: 'Blog' };

export default async function BlogAdminPage() {
  const { db } = await requireOwner();
  const posts = await allPosts(db);
  return (
    <>
      <PageHeader title="Blog" description="Published posts appear on the website blog and in the sitemap." actions={<PostDialog />} />
      <Card bodyless>
        <DataTable
          caption="Posts"
          rows={posts}
          rowKey={(p) => p.id}
          empty={<EmptyState icon={Rss} title="No posts yet" />}
          columns={[
            { key: 'title', header: 'Title', cell: (p) => <strong>{p.title}</strong> },
            { key: 'slug', header: 'Address', cell: (p) => (p.published ? <Link href={`/blog/${p.slug}`} target="_blank">/blog/{p.slug}</Link> : `/blog/${p.slug}`) },
            { key: 'status', header: 'Status', cell: (p) => (p.published ? <Badge tone="success">Published {formatDate(p.published_at)}</Badge> : <Badge>Draft</Badge>) },
            { key: 'actions', header: <span className="visually-hidden">Actions</span>, cell: (p) => <span style={{ display: 'flex', gap: 'var(--space-1)', justifyContent: 'flex-end' }}><PostDialog post={p} /><ConfirmAction label="Delete" title="Delete post?" message={`Delete “${p.title}”?`} confirmLabel="Delete" action={deletePostAction} fields={{ id: p.id }} /></span> },
          ]}
        />
      </Card>
    </>
  );
}
