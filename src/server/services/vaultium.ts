import 'server-only';
import { logActivity } from '@/server/activity';
import type { ShopContext } from '@/server/auth/guards';
import type { Database, RowOf } from '@/server/db';
import type { AppEnv } from '@/server/env';
import { AppError, notFound } from '@/server/errors';
import { addonAllowance } from '@/server/licensing';

/**
 * Vaultium: documents stored in R2 (FILES bucket, vaultium/<admin>/<shop>/…),
 * optionally linked to an invoice or expense. Storage is shared by all shops of
 * an administrator and limited by their Vaultium allowance (GB).
 */

export const MAX_FILES_PER_RECORD = 5;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
const GIB = 1024 ** 3;
/** Types that may be shown in the browser; everything else downloads. */
export const INLINE_SAFE = /^(image\/(png|jpe?g|gif|webp|avif)|application\/pdf|text\/plain)$/i;

export async function storageUsage(db: Database, adminId: string, env: AppEnv) {
  const [allowance, files] = await Promise.all([addonAllowance(db, adminId, 'vaultium'), db.from('vaultium_files').select('size_bytes').eq('admin_id', adminId)]);
  const used = files.reduce((t, f) => t + Number(f.size_bytes), 0);
  return { allowance, usedBytes: used, quotaBytes: (allowance?.limit ?? 0) * GIB, storageReady: !!env.FILES };
}

export async function listFiles(db: Database, shopId: string, q?: string) {
  const files = await db.from('vaultium_files').select('*,invoices(number),expenses(code)').eq('shop_id', shopId).search(['filename'], q).order('created_at', 'desc').limit(200);
  return files as unknown as (RowOf<'vaultium_files'> & { invoices: { number: string } | null; expenses: { code: string } | null })[];
}

/** Uploads files, linked to the invoice number or expense code given (or to nothing). */
export async function uploadFiles(ctx: ShopContext, env: AppEnv, files: File[], link: { invoiceNumber?: string; expenseCode?: string }) {
  const { db, shop } = ctx;
  if (!env.FILES) throw new AppError('File storage is not set up on this server.', 503);
  const usage = await storageUsage(db, shop.admin_id, env);
  if (!usage.allowance) throw new AppError('Vaultium is not active. Add it to your licence or buy it as an add-on.', 403);
  const real = files.filter((f) => f.size > 0);
  if (!real.length) throw new AppError('Choose at least one file.', 400, { files: 'Choose a file' });
  for (const f of real) {
    if (f.size > MAX_FILE_BYTES) throw new AppError(`${f.name} is larger than 5 MB.`, 400);
    if (/^video\//i.test(f.type) || /\.(mp4|webm|mov|avi|mkv)$/i.test(f.name)) throw new AppError('Video files are not allowed.', 400);
  }

  let invoiceId: string | null = null;
  let expenseId: string | null = null;
  if (link.invoiceNumber) {
    const inv = await db.from('invoices').select('id').eq('shop_id', shop.id).eq('number', link.invoiceNumber.trim().toUpperCase()).maybeSingle();
    if (!inv) throw new AppError(`No invoice ${link.invoiceNumber} in this shop.`, 400, { invoice: 'Not found' });
    invoiceId = inv.id;
  } else if (link.expenseCode) {
    const exp = await db.from('expenses').select('id').eq('shop_id', shop.id).eq('code', link.expenseCode.trim().toUpperCase()).maybeSingle();
    if (!exp) throw new AppError(`No expense ${link.expenseCode} in this shop.`, 400, { expense: 'Not found' });
    expenseId = exp.id;
  }
  if (invoiceId || expenseId) {
    const existing = invoiceId ? await db.from('vaultium_files').eq('invoice_id', invoiceId).count() : await db.from('vaultium_files').eq('expense_id', expenseId!).count();
    if (existing + real.length > MAX_FILES_PER_RECORD) throw new AppError(`A record can have at most ${MAX_FILES_PER_RECORD} files.`, 400);
  }
  const incoming = real.reduce((t, f) => t + f.size, 0);
  if (usage.usedBytes + incoming > usage.quotaBytes) throw new AppError('Your storage is full. Delete files or increase the Vaultium allowance.', 400);

  for (const f of real) {
    const key = `vaultium/${shop.admin_id}/${shop.id}/${crypto.randomUUID()}-${f.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120)}`;
    const type = f.type || 'application/octet-stream';
    await env.FILES.put(key, await f.arrayBuffer(), { httpMetadata: { contentType: type } });
    try {
      await db.from('vaultium_files').insert({
        admin_id: shop.admin_id, shop_id: shop.id, invoice_id: invoiceId, expense_id: expenseId, filename: f.name.slice(0, 255), content_type: type,
        size_bytes: f.size, r2_key: key, uploaded_by: ctx.actor.id,
      });
    } catch (e) {
      await env.FILES.delete(key).catch(() => undefined);
      throw e;
    }
  }
  await logActivity(db, { shopId: shop.id, actorType: ctx.actor.type, actorId: ctx.actor.id, action: 'uploaded files', entityType: 'vaultium_files', metadata: { count: real.length } });
  return real.length;
}

export async function deleteFile(ctx: ShopContext, env: AppEnv, id: string) {
  const [row] = await ctx.db.from('vaultium_files').eq('id', id).eq('shop_id', ctx.shop.id).delete();
  if (!row) throw notFound('File');
  await env.FILES?.delete(row.r2_key).catch((e) => console.error('[ems] R2 delete failed', e));
  await logActivity(ctx.db, { shopId: ctx.shop.id, actorType: ctx.actor.type, actorId: ctx.actor.id, action: 'deleted file', entityType: 'vaultium_files', entityId: id, metadata: { name: row.filename } });
}

export async function fileForDownload(db: Database, shopId: string, id: string) {
  return db.from('vaultium_files').select('*').eq('id', id).eq('shop_id', shopId).maybeSingle();
}
