import 'server-only';
import { z } from 'zod';
import { logActivity } from '@/server/activity';
import { hashPassword, verifyPassword } from '@/server/auth/crypto';
import type { AdminContext, OwnerContext } from '@/server/auth/guards';
import type { Database, RowOf } from '@/server/db';
import type { AppEnv } from '@/server/env';
import { AppError, notFound } from '@/server/errors';
import { PAGE_SLUGS, type PageSlug } from './website';

/** Owner and administrator console features that are not shop operations. */

const ownerLog = (ctx: OwnerContext, action: string, entityType: string, entityId?: string, metadata: Record<string, unknown> = {}) =>
  logActivity(ctx.db, { actorType: 'owner', actorId: ctx.owner.id, action, entityType, entityId, metadata });

/* ───────────────────────────── administrators & shops ───────────────────────────── */

export async function listAdmins(db: Database, q?: string) {
  const admins = await db.from('admins').select('id,admin_code,name,email,phone,active,created_at').search(['name', 'email', 'phone', 'admin_code'], q).order('created_at', 'desc').limit(200);
  const shops = admins.length ? await db.from('shops').select('admin_id').in('admin_id', admins.map((a) => a.id)) : [];
  const count = new Map<string, number>();
  for (const s of shops) count.set(s.admin_id, (count.get(s.admin_id) ?? 0) + 1);
  return admins.map((a) => ({ ...a, shops: count.get(a.id) ?? 0 }));
}

export async function setAdminActive(ctx: OwnerContext, id: string, active: boolean) {
  const [row] = await ctx.db.from('admins').eq('id', id).update({ active });
  if (!row) throw notFound('Administrator');
  await ownerLog(ctx, active ? 'activated administrator' : 'deactivated administrator', 'admins', id, { email: row.email });
}

export async function listAllShops(db: Database, q?: string) {
  const shops = await db.from('shops').select('id,name,shop_code,category,active,created_at,admins(name,email)').search(['name', 'shop_code', 'category'], q).order('created_at', 'desc').limit(300);
  return shops as unknown as (Pick<RowOf<'shops'>, 'id' | 'name' | 'shop_code' | 'category' | 'active' | 'created_at'> & { admins: { name: string; email: string } | null })[];
}

/* ───────────────────────────── website ───────────────────────────── */

export const pageSchema = z.object({
  slug: z.enum(PAGE_SLUGS),
  title: z.string().trim().min(2).max(120),
  body: z.string().max(50_000).default(''),
});

export async function allPages(db: Database) {
  const rows = await db.from('pages').select('*');
  const titles: Record<PageSlug, string> = { about: 'About', terms: 'Terms of service', privacy: 'Privacy policy', contact: 'Contact' };
  return PAGE_SLUGS.map((slug) => rows.find((r) => r.slug === slug) ?? { slug, title: titles[slug], body: '', updated_at: null, updated_by: null });
}

export async function savePage(ctx: OwnerContext, input: z.infer<typeof pageSchema>) {
  await ctx.db.from('pages').upsert({ ...input, updated_by: ctx.owner.id }, { onConflict: 'slug' });
  await ownerLog(ctx, 'updated website page', 'pages', input.slug);
}

const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'post';

export const postSchema = z.object({
  title: z.string().trim().min(3, 'Enter a title').max(160),
  slug: z.string().trim().toLowerCase().max(80).optional().transform((v) => v || undefined).refine((v) => !v || /^[a-z0-9]+(-[a-z0-9]+)*$/.test(v), 'Lowercase words separated by hyphens'),
  excerpt: z.string().trim().max(300).optional().transform((v) => v || null),
  body: z.string().max(100_000).default(''),
  cover_image_url: z.string().trim().max(500).optional().transform((v) => v || null).refine((v) => !v || v.startsWith('https://'), 'Use an https:// link'),
  published: z.preprocess((v) => v === 'on', z.boolean()),
});

export async function allPosts(db: Database) {
  return db.from('blog_posts').select('*').order('created_at', 'desc').limit(200);
}

export async function savePost(ctx: OwnerContext, id: string | undefined, input: z.infer<typeof postSchema>) {
  const existing = id ? await ctx.db.from('blog_posts').select('published,published_at').eq('id', id).maybeSingle() : null;
  if (id && !existing) throw notFound('Post');
  const row = {
    title: input.title, slug: input.slug ?? slugify(input.title), excerpt: input.excerpt, body: input.body, cover_image_url: input.cover_image_url,
    published: input.published,
    // Keep the original publication date when a post is edited.
    published_at: input.published ? existing?.published_at ?? new Date().toISOString() : null,
  };
  try {
    if (id) await ctx.db.from('blog_posts').eq('id', id).update(row);
    else await ctx.db.from('blog_posts').insert({ ...row, created_by: ctx.owner.id });
  } catch (e) {
    if (e instanceof Error && /duplicate|23505/i.test(e.message)) throw new AppError('Another post already uses that address.', 409, { slug: 'Choose another slug' });
    throw e;
  }
  await ownerLog(ctx, id ? 'updated blog post' : 'created blog post', 'blog_posts', id, { title: input.title });
}

export async function deletePost(ctx: OwnerContext, id: string) {
  await ctx.db.from('blog_posts').eq('id', id).delete();
  await ownerLog(ctx, 'deleted blog post', 'blog_posts', id);
}

export async function contactInbox(db: Database, status?: string) {
  const q = db.from('contact_messages').select('*').order('created_at', 'desc').limit(200);
  return status ? q.eq('status', status) : q;
}

export async function setMessageStatus(ctx: OwnerContext, id: string, status: 'new' | 'read' | 'closed') {
  await ctx.db.from('contact_messages').eq('id', id).update({ status });
}

/* ───────────────────────────── help desk ───────────────────────────── */

export async function helpdeskThreads(db: Database) {
  const rows = await db.from('helpdesk_messages').select('admin_id,sender,body,read_by_owner,created_at').order('created_at', 'desc').limit(2000);
  const threads = new Map<string, { adminId: string; last: string; at: string; unread: number }>();
  for (const r of rows) {
    const t = threads.get(r.admin_id) ?? { adminId: r.admin_id, last: r.body, at: r.created_at, unread: 0 };
    if (r.sender === 'admin' && !r.read_by_owner) t.unread++;
    threads.set(r.admin_id, t);
  }
  const ids = [...threads.keys()];
  const admins = ids.length ? await db.from('admins').select('id,name,email').in('id', ids) : [];
  return [...threads.values()].map((t) => ({ ...t, admin: admins.find((a) => a.id === t.adminId) ?? null }));
}

export async function conversation(db: Database, adminId: string, viewer: 'owner' | 'admin') {
  const rows = await db.from('helpdesk_messages').select('*').eq('admin_id', adminId).order('created_at').limit(500);
  const unread = rows.filter((r) => r.sender !== viewer && !(viewer === 'owner' ? r.read_by_owner : r.read_by_admin));
  if (unread.length) await db.from('helpdesk_messages').in('id', unread.map((r) => r.id)).update(viewer === 'owner' ? { read_by_owner: true } : { read_by_admin: true });
  return rows;
}

export const messageSchema = z.object({ body: z.string().trim().min(1, 'Write a message').max(4000) });

export async function sendHelpdeskMessage(db: Database, adminId: string, sender: 'owner' | 'admin', body: string) {
  if (sender === 'owner' && !(await db.from('admins').eq('id', adminId).count())) throw notFound('Administrator');
  await db.from('helpdesk_messages').insert({ admin_id: adminId, sender, body, read_by_admin: sender === 'admin', read_by_owner: sender === 'owner' });
}

/* ───────────────────────────── administrator account ───────────────────────────── */

export const profileSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(6).max(30),
  address: z.string().trim().max(300).optional().transform((v) => v || null),
});

export async function updateProfile(ctx: AdminContext, input: z.infer<typeof profileSchema>) {
  await ctx.db.from('admins').eq('id', ctx.admin.id).update(input);
}

export const passwordSchema = z.object({
  current: z.string().min(1, 'Enter your current password'),
  password: z.string().min(10, 'Use at least 10 characters').max(200),
});

export async function changePassword(db: Database, table: 'admins' | 'platform_owners', id: string, input: z.infer<typeof passwordSchema>) {
  const row = table === 'admins'
    ? await db.from('admins').select('password_hash').eq('id', id).maybeSingle()
    : await db.from('platform_owners').select('password_hash').eq('id', id).maybeSingle();
  if (!row || !(await verifyPassword(input.current, row.password_hash))) throw new AppError('Your current password is not correct.', 400, { current: 'Not correct' });
  const password_hash = await hashPassword(input.password);
  if (table === 'admins') await db.from('admins').eq('id', id).update({ password_hash });
  else await db.from('platform_owners').eq('id', id).update({ password_hash });
}

export async function adminDevices(db: Database, adminId: string) {
  const shops = await db.from('shops').select('id,name').eq('admin_id', adminId);
  if (!shops.length) return [];
  const devices = await db.from('shop_devices').select('*,staff(full_name,user_id)').in('shop_id', shops.map((s) => s.id)).order('last_seen_at', 'desc').limit(300);
  return (devices as unknown as (RowOf<'shop_devices'> & { staff: { full_name: string; user_id: string } | null })[]).map((d) => ({ ...d, shop: shops.find((s) => s.id === d.shop_id)?.name ?? '' }));
}

export async function forgetDevice(ctx: AdminContext, id: string) {
  const shops = await ctx.db.from('shops').select('id').eq('admin_id', ctx.admin.id);
  await ctx.db.from('shop_devices').eq('id', id).in('shop_id', shops.map((s) => s.id)).delete();
}

/* ───────────────────────────── system ───────────────────────────── */

export function systemStatus(env: AppEnv) {
  return {
    database: env.provider === 'd1' ? 'Cloudflare D1' : 'Supabase (PostgreSQL)',
    files: !!env.FILES,
    workersAi: !!env.AI,
    email: !!env.BREVO_API_KEY,
    siteUrl: process.env.SITE_URL ?? null,
    aiKeys: (['GEMINI_API_KEY', 'GROQ_API_KEY', 'CEREBRAS_API_KEY', 'DEEPSEEK_API_KEY', 'OPENROUTER_API_KEY', 'GITHUB_TOKEN', 'ANTHROPIC_API_KEY'] as const).filter((k) => !!env[k]),
  };
}

export const RESET_PHRASE = 'DELETE ALL DATA';

/** Erases every record (owner included) and restores the defaults. */
export async function factoryReset(ctx: OwnerContext, password: string, phrase: string) {
  if (phrase.trim() !== RESET_PHRASE) throw new AppError(`Type ${RESET_PHRASE} to confirm.`, 400, { phrase: `Type ${RESET_PHRASE}` });
  if (!(await verifyPassword(password, ctx.owner.password_hash))) throw new AppError('Your password is not correct.', 400, { password: 'Not correct' });
  await ctx.db.rpc('factory_reset');
}

/** Vaultium storage per administrator, largest first. */
export async function storageByAdmin(db: Database) {
  const files = await db.from('vaultium_files').select('admin_id,size_bytes').limit(20000);
  const total = new Map<string, number>();
  for (const f of files) total.set(f.admin_id, (total.get(f.admin_id) ?? 0) + Number(f.size_bytes));
  const top = [...total.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
  const admins = top.length ? await db.from('admins').select('id,name,email').in('id', top.map(([id]) => id)) : [];
  return top.map(([id, bytes]) => ({ id, bytes, admin: admins.find((a) => a.id === id) ?? null }));
}
