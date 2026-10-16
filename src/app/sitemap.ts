import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { getDb } from '@/server/db';
import { publishedPosts } from '@/server/services/website';

async function baseUrl(): Promise<string> {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/+$/, '');
  const h = await headers();
  return `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('host') ?? 'localhost'}`;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = await baseUrl();
  const pages = ['', '/pricing', '/about', '/contact', '/blog', '/apps', '/terms', '/privacy'].map((p) => ({ url: `${base}${p}` }));
  let posts: MetadataRoute.Sitemap = [];
  try {
    posts = (await publishedPosts(await getDb(), 500)).map((p) => ({ url: `${base}/blog/${p.slug}`, lastModified: p.published_at ?? undefined }));
  } catch {
    posts = [];
  }
  return [...pages, ...posts];
}
