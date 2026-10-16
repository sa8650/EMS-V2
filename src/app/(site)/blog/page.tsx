import type { Metadata } from 'next';
import Link from 'next/link';
import { EmptyState } from '@/components/ui/display';
import s from '@/components/site/site.module.css';
import { formatDate } from '@/lib/format';
import { getDb } from '@/server/db';
import { publishedPosts } from '@/server/services/website';

export const metadata: Metadata = { title: 'Blog', description: 'News, guides and updates.' };

export default async function BlogPage() {
  let posts: Awaited<ReturnType<typeof publishedPosts>> = [];
  try {
    posts = await publishedPosts(await getDb());
  } catch {
    posts = [];
  }
  return (
    <section className={s.section}>
      <div className={s.container}>
        <div className={s.sectionHead}>
          <h1 className={s.h2}>Blog</h1>
          <p className={s.muted}>News, guides and product updates.</p>
        </div>
        {posts.length ? (
          <div className={s.posts}>
            {posts.map((p) => (
              <Link key={p.id} href={`/blog/${p.slug}`} className={s.post}>
                <span className={s.proseMeta}>{formatDate(p.published_at)}</span>
                <h2 className={s.tileTitle}>{p.title}</h2>
                {p.excerpt && <p className={s.tileText}>{p.excerpt}</p>}
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState title="No posts yet">New articles will appear here.</EmptyState>
        )}
      </div>
    </section>
  );
}
