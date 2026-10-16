import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import s from '@/components/site/site.module.css';
import { formatDate } from '@/lib/format';
import { getDb } from '@/server/db';
import { paragraphs, publishedPost } from '@/server/services/website';

async function load(slug: string) {
  try {
    return await publishedPost(await getDb(), slug);
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const post = await load((await params).slug);
  return post ? { title: post.title, description: post.excerpt ?? undefined, openGraph: { type: 'article', title: post.title } } : { title: 'Post not found' };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const post = await load((await params).slug);
  if (!post) notFound();
  return (
    <section className={s.section}>
      <article className={`${s.container} ${s.prose}`}>
        <Link href="/blog" className={s.proseMeta}>
          ← All posts
        </Link>
        <h1>{post.title}</h1>
        <p className={s.proseMeta}>{formatDate(post.published_at)}</p>
        {post.cover_image_url && /^https:\/\//.test(post.cover_image_url) && (
          <Image src={post.cover_image_url} alt="" width={1200} height={630} className={s.cover} style={{ height: 'auto' }} />
        )}
        {paragraphs(post.body).map((p, i) => (
          <p key={i} style={{ whiteSpace: 'pre-line' }}>
            {p}
          </p>
        ))}
      </article>
    </section>
  );
}
