import 'server-only';
import { z } from 'zod';
import type { Database } from '@/server/db';
import { readModules } from '@/server/licensing';

/** Public website content: plans, CMS pages, blog, contact messages and published apps. */

export const PAGE_SLUGS = ['about', 'terms', 'privacy', 'contact'] as const;
export type PageSlug = (typeof PAGE_SLUGS)[number];

export async function publicPlans(db: Database) {
  const plans = await db.from('license_plans').select('id,title,duration_months,max_shops,price,benefits,modules').eq('active', true).order('price').order('duration_months');
  return plans.map((p) => ({ ...p, modules: readModules(p.modules), benefits: (p.benefits ?? '').split('\n').map((b) => b.trim()).filter(Boolean) }));
}

export async function getPage(db: Database, slug: PageSlug) {
  const page = await db.from('pages').select('title,body,updated_at').eq('slug', slug).maybeSingle();
  return page && page.body.trim() ? page : null;
}

export async function publishedPosts(db: Database, limit = 50) {
  return db.from('blog_posts').select('id,slug,title,excerpt,cover_image_url,published_at').eq('published', true).order('published_at', 'desc').limit(limit);
}

export async function publishedPost(db: Database, slug: string) {
  return db.from('blog_posts').select('*').eq('slug', slug).eq('published', true).maybeSingle();
}

export const contactSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(120),
  phone: z.string().trim().max(30).optional().transform((v) => v || null),
  subject: z.string().trim().max(120).optional().transform((v) => v || null),
  message: z.string().trim().min(10, 'Tell us a little more (10+ characters)').max(4000),
  /** Honeypot: real visitors never fill this hidden field. */
  website: z.string().max(0, 'Please leave this empty').optional(),
});

export async function createContactMessage(db: Database, input: z.infer<typeof contactSchema>) {
  const { website: _honeypot, ...row } = input;
  await db.from('contact_messages').insert(row);
}

/** Splits CMS text into paragraphs; text is always rendered as text, never as HTML. */
export const paragraphs = (body: string) => body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
