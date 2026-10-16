import 'server-only';
import { z } from 'zod';
import { returnedLineValue, round2 } from '@/lib/invoice-math';
import { today } from '@/lib/dates';
import { logActivity } from '@/server/activity';
import type { ShopContext } from '@/server/auth/guards';
import type { Database, RowOf } from '@/server/db';
import { autoSms } from '@/server/connectx/sms';
import { AppError, notFound } from '@/server/errors';
import { PAYMENT_METHODS } from './invoices';
import { nextCode, PAGE_SIZE } from './records';

/**
 * Sales returns and exchanges. Sellable items go back into stock; damaged or
 * defective items are quarantined (recorded, never added to sellable stock).
 */

export const RETURN_REASONS = {
  changed_mind: 'Customer changed mind', defective: 'Defective', wrong_product: 'Wrong product', damaged: 'Damaged',
  wrong_spec: 'Wrong specification', other: 'Other',
} as const;
export const CONDITIONS = { sellable: 'Sellable', damaged: 'Damaged', defective: 'Defective' } as const;

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const reasonKey = z.enum(Object.keys(RETURN_REASONS) as [keyof typeof RETURN_REASONS, ...(keyof typeof RETURN_REASONS)[]]);
const conditionKey = z.enum(['sellable', 'damaged', 'defective']);
const method = z.enum([...PAYMENT_METHODS, 'none']).default('cash');
const optional = (max: number) => z.string().trim().max(max).optional().transform((v) => v || null);
/** A JSON array posted in one form field (built by the return/exchange form). */
const jsonList = <T extends z.ZodType>(item: T, min: string) =>
  z.string().transform((s, c) => {
    try {
      return JSON.parse(s) as unknown;
    } catch {
      c.addIssue({ code: 'custom', message: min });
      return z.NEVER;
    }
  }).pipe(z.array(item).min(1, min));

const otherNeedsNote = (v: { reason: string; reason_note: string | null }) => v.reason !== 'other' || !!v.reason_note;
const returnedBase = z.object({
  invoice_line_id: z.string().uuid(),
  quantity: z.coerce.number().finite().positive('Quantity must be more than 0'),
  reason: reasonKey,
  reason_note: optional(300),
  condition: conditionKey,
});
const returnedItem = returnedBase.extend({ penalty: z.coerce.number().finite().min(0).default(0) })
  .refine(otherNeedsNote, { message: 'Add a note when the reason is Other', path: ['reason_note'] });
const exchangedItem = returnedBase.refine(otherNeedsNote, { message: 'Add a note when the reason is Other', path: ['reason_note'] });

export const returnSchema = z.object({
  invoice_id: z.string().uuid(),
  items: jsonList(returnedItem, 'Choose at least one item to return'),
  refund_method: method,
  transaction_id: optional(80),
  notes: optional(500),
});

const newItem = z.object({
  product_id: z.string().uuid(),
  quantity: z.coerce.number().finite().positive('Quantity must be more than 0'),
  unit_price: z.coerce.number().finite().min(0),
  tax_percent: z.coerce.number().finite().min(0).max(100).default(0),
  discount: z.coerce.number().finite().min(0).default(0),
});

export const exchangeSchema = z.object({
  invoice_id: z.string().uuid(),
  returned: jsonList(exchangedItem, 'Choose at least one item coming back'),
  new_items: jsonList(newItem, 'Add at least one replacement item'),
  payment_method: method,
  transaction_id: optional(80),
  notes: optional(500),
});

type Line = RowOf<'invoice_lines'> & { returnable: number; code: string };

/** A sale invoice of this shop with how much of each line can still come back. */
export async function returnableInvoice(db: Database, shopId: string, invoiceId: string) {
  const invoice = await db.from('invoices').select('*').eq('id', invoiceId).eq('shop_id', shopId).eq('kind', 'sale').maybeSingle();
  if (!invoice) throw notFound('Sales invoice');
  const lines = await db.from('invoice_lines').select('*,products(code)').eq('invoice_id', invoiceId);
  const ids = lines.map((l) => l.id);
  const [r, x] = ids.length
    ? await Promise.all([
        db.from('return_items').select('invoice_line_id,quantity').in('invoice_line_id', ids),
        db.from('exchange_items').select('invoice_line_id,quantity').eq('direction', 'returned').in('invoice_line_id', ids),
      ])
    : [[], []];
  const used = new Map<string, number>();
  for (const it of [...r, ...x]) used.set(String(it.invoice_line_id), (used.get(String(it.invoice_line_id)) ?? 0) + Number(it.quantity));
  const out: Line[] = lines.map((l) => ({
    ...l,
    code: (l as unknown as { products: { code: string } | null }).products?.code ?? '',
    returnable: Math.max(0, round3(Number(l.quantity) - (used.get(l.id) ?? 0))),
  }));
  return { invoice, lines: out };
}

const lineValue = (invoice: RowOf<'invoices'>, line: Line, qty: number) =>
  returnedLineValue({ quantity: line.quantity, unitPrice: line.unit_price, taxPercent: line.tax_percent, discount: line.discount }, invoice.tax_percent, qty);

function checkReturned(lines: Line[], items: { invoice_line_id: string; quantity: number }[]) {
  const requested = new Map<string, number>();
  for (const it of items) {
    const line = lines.find((l) => l.id === it.invoice_line_id);
    if (!line) throw new AppError('A selected item is not on this invoice.', 400);
    const total = round3((requested.get(line.id) ?? 0) + it.quantity);
    if (total > line.returnable + 0.0001) throw new AppError(`Only ${line.returnable} of ${line.product_name} can still be returned.`, 400);
    requested.set(line.id, total);
  }
}

/** Compare-and-set stock change; retries when another request changed the stock first. */
export async function adjustStock(db: Database, shopId: string, productId: string, delta: number) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const p = await db.from('products').select('stock,name').eq('id', productId).eq('shop_id', shopId).maybeSingle();
    if (!p) throw notFound('Product');
    const before = Number(p.stock);
    const after = round3(before + delta);
    if (after < 0) throw new AppError(`Insufficient stock for ${p.name}.`, 409);
    if ((await db.from('products').eq('id', productId).eq('shop_id', shopId).eq('stock', before).update({ stock: after })).length) return { before, after };
  }
  throw new AppError('Stock changed while saving. Please try again.', 409);
}

async function stockOf(db: Database, productId: string) {
  return Number((await db.from('products').select('stock').eq('id', productId).single()).stock);
}

export async function createReturn(ctx: ShopContext, input: z.infer<typeof returnSchema>) {
  const { db, shop } = ctx;
  const { invoice, lines } = await returnableInvoice(db, shop.id, input.invoice_id);
  checkReturned(lines, input.items);
  let subtotal = 0, tax = 0, disc = 0, penalties = 0, total = 0;
  const items = input.items.map((it) => {
    const line = lines.find((l) => l.id === it.invoice_line_id)!;
    const v = lineValue(invoice, line, it.quantity);
    const penalty = round2(it.penalty);
    const amount = Math.max(0, round2(v.sub + v.tax - v.disc - penalty));
    subtotal += v.sub; tax += v.tax; disc += v.disc; penalties += penalty; total += amount;
    return { line, it, v, penalty, amount };
  });
  total = round2(total);
  const refunded = input.refund_method === 'none' ? 0 : total;
  const ret = await db.from('returns').insertOne({
    shop_id: shop.id, invoice_id: invoice.id, number: await nextCode(db, shop.id, 'return', 'RET-', 6), customer_id: invoice.customer_id,
    customer_name: invoice.party_name, return_date: today(), subtotal: round2(subtotal), tax_amount: round2(tax), discount_amount: round2(disc),
    penalty_amount: round2(penalties), total, refunded, refund_method: input.refund_method, transaction_id: input.transaction_id,
    status: refunded >= total ? 'refunded' : refunded > 0 ? 'partially_refunded' : 'pending_refund', notes: input.notes, created_by: ctx.actor.id,
  });
  await db.from('return_items').insert(items.map(({ line, it, v, penalty, amount }) => ({
    return_id: ret.id, invoice_line_id: line.id, product_id: line.product_id, quantity: it.quantity, unit_price: v.unitPrice, tax_percent: v.taxPct,
    tax_amount: v.tax, discount: v.disc, penalty, amount, reason: it.reason, reason_note: it.reason_note, condition: it.condition,
  })));
  const movements = [];
  for (const { line, it } of items) {
    const { before, after } = it.condition === 'sellable'
      ? await adjustStock(db, shop.id, line.product_id, it.quantity)
      : await stockOf(db, line.product_id).then((s) => ({ before: s, after: s }));
    movements.push({
      shop_id: shop.id, product_id: line.product_id, type: it.condition === 'sellable' ? 'return_in' : 'return_quarantine', quantity: it.quantity,
      stock_before: before, stock_after: after, return_id: ret.id, condition: it.condition,
      notes: `${RETURN_REASONS[it.reason]}${it.reason_note ? ` — ${it.reason_note}` : ''}`, created_by: ctx.actor.id,
    });
  }
  await db.from('stock_movements').insert(movements);
  await logActivity(db, { shopId: shop.id, actorType: ctx.actor.type, actorId: ctx.actor.id, action: 'created return', entityType: 'returns', entityId: ret.id, metadata: { number: ret.number, invoice: invoice.number, total, refunded } });
  const sms = { number: ret.number, phone: invoice.party_phone, name: invoice.party_name, customerId: invoice.customer_id, invoiceId: invoice.id, amount: refunded };
  await autoSms(db, shop, ctx.actor.id, 'RETURN', { ...sms, sourceId: ret.id });
  if (refunded > 0) await autoSms(db, shop, ctx.actor.id, 'REFUND', { ...sms, sourceId: ret.id });
  return ret;
}

export async function createExchange(ctx: ShopContext, input: z.infer<typeof exchangeSchema>) {
  const { db, shop } = ctx;
  const returnedInput = input.returned;
  const { invoice, lines } = await returnableInvoice(db, shop.id, input.invoice_id);
  checkReturned(lines, returnedInput);

  let returnedTotal = 0;
  const back = returnedInput.map((it) => {
    const line = lines.find((l) => l.id === it.invoice_line_id)!;
    const v = lineValue(invoice, line, it.quantity);
    const amount = Math.max(0, round2(v.sub + v.tax - v.disc));
    returnedTotal += amount;
    return { line, it, v, amount };
  });

  const productIds = [...new Set(input.new_items.map((n) => n.product_id))];
  const products = await db.from('products').select('id,name,stock,active').eq('shop_id', shop.id).in('id', productIds);
  const byId = new Map(products.map((p) => [p.id, p]));
  const need = new Map<string, number>();
  let newSub = 0, newTax = 0, newDisc = 0, newTotal = 0;
  const out = input.new_items.map((n) => {
    const p = byId.get(n.product_id);
    if (!p || !p.active) throw new AppError('A replacement item is not available in this shop.', 400);
    need.set(p.id, round3((need.get(p.id) ?? 0) + n.quantity));
    const sub = round2(n.quantity * n.unit_price);
    const tax = round2((sub * n.tax_percent) / 100);
    const disc = round2(n.discount);
    if (disc > sub + tax) throw new AppError(`The discount on ${p.name} is more than its value.`, 400);
    const total = round2(sub + tax - disc);
    newSub += sub; newTax += tax; newDisc += disc; newTotal += total;
    return { p, n, tax, disc, total };
  });
  // Returned sellable units of the same product count towards the stock available for replacements.
  for (const [pid, qty] of need) {
    const comingBack = back.filter((b) => b.line.product_id === pid && b.it.condition === 'sellable').reduce((t, b) => t + b.it.quantity, 0);
    const p = byId.get(pid)!;
    if (Number(p.stock) + comingBack < qty) throw new AppError(`Insufficient stock for ${p.name}: ${Number(p.stock)} available.`, 400);
  }

  returnedTotal = round2(returnedTotal);
  newTotal = round2(newTotal);
  const difference = round2(newTotal - returnedTotal);
  const settlement = difference > 0 ? 'payment' : difference < 0 ? 'refund' : 'even';
  if (settlement !== 'even' && input.payment_method === 'none') throw new AppError(settlement === 'payment' ? 'Choose how the customer pays the difference.' : 'Choose how the difference is refunded.', 400);

  const ex = await db.from('exchanges').insertOne({
    shop_id: shop.id, invoice_id: invoice.id, number: await nextCode(db, shop.id, 'exchange', 'EXC-', 6), customer_id: invoice.customer_id,
    customer_name: invoice.party_name, exchange_date: today(), returned_total: returnedTotal, new_subtotal: round2(newSub), new_tax: round2(newTax),
    new_discount: round2(newDisc), new_total: newTotal, difference, settlement, payment_method: settlement === 'even' ? 'none' : input.payment_method,
    transaction_id: input.transaction_id, status: 'completed', notes: input.notes, created_by: ctx.actor.id,
  });
  await db.from('exchange_items').insert([
    ...back.map(({ line, it, v, amount }) => ({
      exchange_id: ex.id, direction: 'returned', invoice_line_id: line.id, product_id: line.product_id, quantity: it.quantity, unit_price: v.unitPrice,
      tax_percent: v.taxPct, tax_amount: v.tax, discount: v.disc, total: amount, reason: it.reason, reason_note: it.reason_note, condition: it.condition,
    })),
    ...out.map(({ p, n, tax, disc, total }) => ({
      exchange_id: ex.id, direction: 'new', product_id: p.id, quantity: n.quantity, unit_price: n.unit_price, tax_percent: n.tax_percent, tax_amount: tax, discount: disc, total,
    })),
  ]);
  const movements = [];
  for (const { line, it } of back) {
    const { before, after } = it.condition === 'sellable'
      ? await adjustStock(db, shop.id, line.product_id, it.quantity)
      : await stockOf(db, line.product_id).then((s) => ({ before: s, after: s }));
    movements.push({ shop_id: shop.id, product_id: line.product_id, type: it.condition === 'sellable' ? 'exchange_in' : 'exchange_quarantine', quantity: it.quantity, stock_before: before, stock_after: after, exchange_id: ex.id, condition: it.condition, notes: RETURN_REASONS[it.reason], created_by: ctx.actor.id });
  }
  for (const [pid, qty] of need) {
    const { before, after } = await adjustStock(db, shop.id, pid, -qty);
    movements.push({ shop_id: shop.id, product_id: pid, type: 'exchange_out', quantity: qty, stock_before: before, stock_after: after, exchange_id: ex.id, created_by: ctx.actor.id });
  }
  await db.from('stock_movements').insert(movements);
  await logActivity(db, { shopId: shop.id, actorType: ctx.actor.type, actorId: ctx.actor.id, action: 'created exchange', entityType: 'exchanges', entityId: ex.id, metadata: { number: ex.number, invoice: invoice.number, difference } });
  await autoSms(db, shop, ctx.actor.id, 'EXCHANGE', { sourceId: ex.id, number: ex.number, phone: invoice.party_phone, name: invoice.party_name, customerId: invoice.customer_id, invoiceId: invoice.id, amount: Math.abs(difference) });
  return ex;
}

export async function listReturns(db: Database, shopId: string, page: number) {
  const [rows, total] = await Promise.all([
    db.from('returns').select('id,number,return_date,customer_name,total,refunded,status,invoices(number)').eq('shop_id', shopId).order('created_at', 'desc').limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE),
    db.from('returns').eq('shop_id', shopId).count(),
  ]);
  return { rows: rows as (RowOf<'returns'> & { invoices: { number: string } | null })[], total };
}

export async function listExchanges(db: Database, shopId: string, page: number) {
  const [rows, total] = await Promise.all([
    db.from('exchanges').select('id,number,exchange_date,customer_name,returned_total,new_total,difference,settlement,invoices(number)').eq('shop_id', shopId).order('created_at', 'desc').limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE),
    db.from('exchanges').eq('shop_id', shopId).count(),
  ]);
  return { rows: rows as (RowOf<'exchanges'> & { invoices: { number: string } | null })[], total };
}

/** Damaged and defective items that came back (kept out of sellable stock). */
export async function quarantine(db: Database, shopId: string) {
  return db.from('stock_movements').select('id,type,quantity,condition,notes,created_at,return_id,exchange_id,products(code,name,unit)')
    .eq('shop_id', shopId).in('type', ['return_quarantine', 'exchange_quarantine']).order('created_at', 'desc').limit(200);
}

export async function getReturn(db: Database, shopId: string, id: string) {
  const ret = await db.from('returns').select('*,invoices(number,invoice_date)').eq('id', id).eq('shop_id', shopId).maybeSingle();
  if (!ret) throw notFound('Return');
  const items = await db.from('return_items').select('*,products(code,name,unit)').eq('return_id', id);
  return { ret: ret as RowOf<'returns'> & { invoices: { number: string; invoice_date: string } | null }, items: items as (RowOf<'return_items'> & { products: { code: string; name: string; unit: string } | null })[] };
}

export async function getExchange(db: Database, shopId: string, id: string) {
  const ex = await db.from('exchanges').select('*,invoices(number,invoice_date)').eq('id', id).eq('shop_id', shopId).maybeSingle();
  if (!ex) throw notFound('Exchange');
  const items = await db.from('exchange_items').select('*,products(code,name,unit)').eq('exchange_id', id);
  return { ex: ex as RowOf<'exchanges'> & { invoices: { number: string; invoice_date: string } | null }, items: items as (RowOf<'exchange_items'> & { products: { code: string; name: string; unit: string } | null })[] };
}
