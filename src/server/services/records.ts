import 'server-only';
import { z } from 'zod';
import { round2 } from '@/lib/invoice-math';
import { isYmd, today } from '@/lib/dates';
import { logActivity } from '@/server/activity';
import type { ShopContext } from '@/server/auth/guards';
import type { Database, RowOf } from '@/server/db';
import { AppError, notFound } from '@/server/errors';

/** Customers, suppliers, products and expenses of one shop. Every query is scoped to ctx.shop.id. */

export const PAGE_SIZE = 25;

const optionalText = (max: number) => z.string().trim().max(max).optional().transform((v) => v || null);
const money = z.coerce.number({ message: 'Enter an amount' }).finite().min(0, 'Cannot be negative').max(1e11).transform(round2);

/** Next business number in a shop, e.g. CUS-0007. */
export async function nextCode(db: Database, shopId: string, name: string, prefix: string, width: number): Promise<string> {
  const n = Number(await db.rpc('next_counter', { p_scope: shopId, p_name: name }));
  return `${prefix}${String(n).padStart(width, '0')}`;
}

const actorOf = (ctx: ShopContext) => ({ actorType: ctx.actor.type, actorId: ctx.actor.id, shopId: ctx.shop.id });

export function pageOf(raw: unknown): number {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/* ───────────────────────────── customers & suppliers ───────────────────────────── */

export type PartyTable = 'customers' | 'suppliers';
const PARTY = {
  customers: { code: 'customer', prefix: 'CUS-', label: 'Customer', invoiceColumn: 'customer_id' as const },
  suppliers: { code: 'supplier', prefix: 'SUP-', label: 'Supplier', invoiceColumn: 'supplier_id' as const },
};

export const partySchema = z.object({
  name: z.string().trim().min(2, 'Enter a name').max(120),
  phone: optionalText(30),
  phone2: optionalText(30),
  email: z.string().trim().toLowerCase().max(120).optional().transform((v) => v || null).refine((v) => !v || z.string().email().safeParse(v).success, 'Enter a valid email'),
  address: optionalText(300),
});

export async function listParties(db: Database, table: PartyTable, shopId: string, opts: { q?: string; page?: number }) {
  const page = opts.page ?? 1;
  const base = () => db.from(table).eq('shop_id', shopId).search(['name', 'phone', 'code', 'email'], opts.q);
  const [rows, total] = await Promise.all([base().order('name').limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE), base().count()]);
  return { rows: rows as RowOf<PartyTable>[], total, page };
}

/** Outstanding dues per party (sale dues for customers, purchase dues for suppliers). */
export async function partyDues(db: Database, table: PartyTable, shopId: string, ids: string[]): Promise<Map<string, number>> {
  const col = PARTY[table].invoiceColumn;
  const out = new Map<string, number>();
  if (!ids.length) return out;
  const rows = await db.from('invoices').select(`${col},due`).eq('shop_id', shopId).in(col, ids).gt('due', 0);
  for (const r of rows as unknown as Record<string, unknown>[]) {
    const id = String(r[col]);
    out.set(id, round2((out.get(id) ?? 0) + Number(r.due)));
  }
  return out;
}

export async function createParty(ctx: ShopContext, table: PartyTable, input: z.infer<typeof partySchema>) {
  const p = PARTY[table];
  const row = await ctx.db.from(table).insertOne({ ...input, shop_id: ctx.shop.id, code: await nextCode(ctx.db, ctx.shop.id, p.code, p.prefix, 4) });
  await logActivity(ctx.db, { ...actorOf(ctx), action: `created ${p.label.toLowerCase()}`, entityType: table, entityId: row.id, metadata: { name: row.name, code: row.code } });
  return row;
}

export async function updateParty(ctx: ShopContext, table: PartyTable, id: string, input: z.infer<typeof partySchema>) {
  const [row] = await ctx.db.from(table).eq('id', id).eq('shop_id', ctx.shop.id).update(input);
  if (!row) throw notFound(PARTY[table].label);
  await logActivity(ctx.db, { ...actorOf(ctx), action: `updated ${PARTY[table].label.toLowerCase()}`, entityType: table, entityId: id, metadata: { name: input.name } });
}

export async function deleteParty(ctx: ShopContext, table: PartyTable, id: string) {
  const p = PARTY[table];
  const used = await ctx.db.from('invoices').eq('shop_id', ctx.shop.id).eq(p.invoiceColumn, id).count();
  if (used) throw new AppError(`This ${p.label.toLowerCase()} has ${used} invoice${used === 1 ? '' : 's'} and cannot be deleted.`, 409);
  const [row] = await ctx.db.from(table).eq('id', id).eq('shop_id', ctx.shop.id).delete();
  if (!row) throw notFound(p.label);
  await logActivity(ctx.db, { ...actorOf(ctx), action: `deleted ${p.label.toLowerCase()}`, entityType: table, entityId: id, metadata: { name: row.name, code: row.code } });
}

/* ───────────────────────────── products ───────────────────────────── */

export const productSchema = z.object({
  name: z.string().trim().min(2, 'Enter a product name').max(160),
  category: optionalText(80),
  unit: z.string().trim().min(1).max(20).default('pcs'),
  sale_price: money,
});

export async function listProducts(db: Database, shopId: string, opts: { q?: string; page?: number; stock?: 'low' | 'out'; threshold: number; inactive?: boolean }) {
  const page = opts.page ?? 1;
  const base = () => {
    let q = db.from('products').eq('shop_id', shopId).eq('active', !opts.inactive).search(['name', 'code', 'category'], opts.q);
    if (opts.stock === 'low') q = q.lte('stock', opts.threshold);
    if (opts.stock === 'out') q = q.lte('stock', 0);
    return q;
  };
  const [rows, total] = await Promise.all([base().order('name').limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE), base().count()]);
  return { rows, total, page };
}

/** Active products for invoice forms (name, code, price, stock). */
export async function productOptions(db: Database, shopId: string) {
  return db.from('products').select('id,code,name,unit,sale_price,stock').eq('shop_id', shopId).eq('active', true).order('name').limit(2000);
}

export async function createProduct(ctx: ShopContext, input: z.infer<typeof productSchema>) {
  const row = await ctx.db.from('products').insertOne({ ...input, shop_id: ctx.shop.id, code: await nextCode(ctx.db, ctx.shop.id, 'product', 'ITM-', 5) });
  await logActivity(ctx.db, { ...actorOf(ctx), action: 'created product', entityType: 'products', entityId: row.id, metadata: { name: row.name, code: row.code } });
  return row;
}

export async function updateProduct(ctx: ShopContext, id: string, input: z.infer<typeof productSchema>) {
  const [row] = await ctx.db.from('products').eq('id', id).eq('shop_id', ctx.shop.id).update(input);
  if (!row) throw notFound('Product');
  await logActivity(ctx.db, { ...actorOf(ctx), action: 'updated product', entityType: 'products', entityId: id, metadata: { name: input.name } });
}

/** Products that appear on invoices are deactivated instead of deleted, so history stays intact. */
export async function removeProduct(ctx: ShopContext, id: string): Promise<'deleted' | 'deactivated'> {
  const product = await ctx.db.from('products').select('id,name,code').eq('id', id).eq('shop_id', ctx.shop.id).maybeSingle();
  if (!product) throw notFound('Product');
  const used = await ctx.db.from('invoice_lines').eq('product_id', id).count();
  if (used) await ctx.db.from('products').eq('id', id).update({ active: false });
  else await ctx.db.from('products').eq('id', id).eq('shop_id', ctx.shop.id).delete();
  const result = used ? 'deactivated' : 'deleted';
  await logActivity(ctx.db, { ...actorOf(ctx), action: `${result} product`, entityType: 'products', entityId: id, metadata: { name: product.name, code: product.code } });
  return result;
}

export async function restoreProduct(ctx: ShopContext, id: string) {
  const [row] = await ctx.db.from('products').eq('id', id).eq('shop_id', ctx.shop.id).update({ active: true });
  if (!row) throw notFound('Product');
}

/* ───────────────────────────── expenses ───────────────────────────── */

export const expenseSchema = z
  .object({
    expense_date: z.string().refine(isYmd, 'Pick a date').default(today),
    details: z.string().trim().min(2, 'Describe the expense').max(300),
    total: z.coerce.number({ message: 'Enter an amount' }).finite().positive('Must be more than 0').max(1e11).transform(round2),
    paid: money.default(0),
    note: optionalText(500),
  })
  .refine((v) => v.paid <= v.total, { message: 'Paid cannot be more than the total', path: ['paid'] });

export async function listExpenses(db: Database, shopId: string, opts: { q?: string; page?: number; from?: string; to?: string }) {
  const page = opts.page ?? 1;
  const base = () => {
    let q = db.from('expenses').eq('shop_id', shopId).search(['details', 'code', 'note'], opts.q);
    if (opts.from) q = q.gte('expense_date', opts.from);
    if (opts.to) q = q.lte('expense_date', opts.to);
    return q;
  };
  const [rows, total, all] = await Promise.all([
    base().order('expense_date', 'desc').order('created_at', 'desc').limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE),
    base().count(),
    base().select('total,due'),
  ]);
  return { rows, total, page, sum: round2(all.reduce((t, r) => t + Number(r.total), 0)), due: round2(all.reduce((t, r) => t + Number(r.due), 0)) };
}

export async function createExpense(ctx: ShopContext, input: z.infer<typeof expenseSchema>) {
  const row = await ctx.db.from('expenses').insertOne({ ...input, shop_id: ctx.shop.id, created_by: ctx.actor.id, code: await nextCode(ctx.db, ctx.shop.id, 'expense', 'EXP-', 4) });
  await logActivity(ctx.db, { ...actorOf(ctx), action: 'recorded expense', entityType: 'expenses', entityId: row.id, metadata: { code: row.code, total: row.total } });
  return row;
}

export async function updateExpense(ctx: ShopContext, id: string, input: z.infer<typeof expenseSchema>) {
  const paidSoFar = await ctx.db.from('due_payments').select('amount').eq('shop_id', ctx.shop.id).eq('source_type', 'expense').eq('source_id', id);
  const collected = round2(paidSoFar.reduce((t, r) => t + Number(r.amount), 0));
  if (input.paid < collected) throw new AppError(`${collected} has already been paid through due payments; paid cannot be lower.`, 400, { paid: `At least ${collected}` });
  const [row] = await ctx.db.from('expenses').eq('id', id).eq('shop_id', ctx.shop.id).update(input);
  if (!row) throw notFound('Expense');
  await logActivity(ctx.db, { ...actorOf(ctx), action: 'updated expense', entityType: 'expenses', entityId: id, metadata: { code: row.code } });
}

export async function deleteExpense(ctx: ShopContext, id: string) {
  if (await ctx.db.from('due_payments').eq('shop_id', ctx.shop.id).eq('source_type', 'expense').eq('source_id', id).count()) {
    throw new AppError('Payments were recorded for this expense, so it cannot be deleted.', 409);
  }
  const [row] = await ctx.db.from('expenses').eq('id', id).eq('shop_id', ctx.shop.id).delete();
  if (!row) throw notFound('Expense');
  await logActivity(ctx.db, { ...actorOf(ctx), action: 'deleted expense', entityType: 'expenses', entityId: id, metadata: { code: row.code, total: row.total } });
}
