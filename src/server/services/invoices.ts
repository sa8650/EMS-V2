import 'server-only';
import { z } from 'zod';
import { computeInvoiceTotals, InvoiceRuleError, round2 } from '@/lib/invoice-math';
import { isYmd, today } from '@/lib/dates';
import { logActivity } from '@/server/activity';
import type { ShopContext } from '@/server/auth/guards';
import type { Database, RowOf } from '@/server/db';
import { autoSms } from '@/server/connectx/sms';
import { AppError, notFound } from '@/server/errors';
import { PAGE_SIZE } from './records';

/** Sale and purchase invoices. Totals: src/lib/invoice-math.ts; atomic posting: post_invoice. */

export type InvoiceKind = 'sale' | 'purchase';
export const PAYMENT_METHODS = ['cash', 'bkash', 'nagad', 'bank', 'other'] as const;
export const PAYMENT_LABELS: Record<(typeof PAYMENT_METHODS)[number], string> = { cash: 'Cash', bkash: 'bKash', nagad: 'Nagad', bank: 'Bank', other: 'Other' };

const num = (label: string) => z.coerce.number({ message: `Enter ${label}` }).finite();
const optional = (max: number) => z.string().trim().max(max).optional().transform((v) => v || null);

const lineSchema = z.object({
  product_id: z.string().uuid('Choose a product'),
  quantity: num('a quantity').positive('Quantity must be more than 0').max(1e9),
  unit_price: num('a price').min(0, 'Price cannot be negative').max(1e11),
  tax_percent: num('VAT').min(0).max(100).default(0),
  discount: num('a discount').min(0).max(1e11).default(0),
});

export const invoiceSchema = z.object({
  kind: z.enum(['sale', 'purchase']),
  party_id: z.string().uuid().optional().or(z.literal('').transform(() => undefined)),
  party_name: optional(120),
  party_phone: optional(30),
  party_address: optional(300),
  invoice_date: z.string().refine(isYmd, 'Pick a date').default(today),
  payment_method: z.enum(PAYMENT_METHODS).default('cash'),
  transaction_id: optional(80),
  notes: optional(1000),
  tax_percent: num('VAT').min(0).max(100).default(0),
  discount: num('a discount').min(0).max(1e11).default(0),
  paid: num('the amount paid').min(0, 'Paid cannot be negative').max(1e11).default(0),
  lines: z
    .string()
    .transform((s, c) => {
      try {
        return JSON.parse(s) as unknown;
      } catch {
        c.addIssue({ code: 'custom', message: 'Add at least one item' });
        return z.NEVER;
      }
    })
    .pipe(z.array(lineSchema).min(1, 'Add at least one item').max(200, 'An invoice can have up to 200 lines')),
});

export type InvoiceInput = z.infer<typeof invoiceSchema>;

export async function postInvoice(ctx: ShopContext, input: InvoiceInput): Promise<RowOf<'invoices'>> {
  const { db, shop } = ctx;
  const ids = [...new Set(input.lines.map((l) => l.product_id))];
  const products = await db.from('products').select('id,code,name').eq('shop_id', shop.id).in('id', ids);
  const byId = new Map(products.map((p) => [p.id, p]));

  let totals;
  try {
    totals = computeInvoiceTotals(
      input.lines.map((l) => ({ quantity: l.quantity, unitPrice: l.unit_price, taxPercent: l.tax_percent, discount: l.discount, label: byId.get(l.product_id)?.code })),
      { taxPercent: input.tax_percent, discount: input.discount, paid: input.paid },
    );
  } catch (e) {
    if (e instanceof InvoiceRuleError) throw new AppError(e.message, 400, e.message.startsWith('Paid') ? { paid: e.message } : undefined);
    throw e;
  }

  // Snapshot the party so the invoice stays readable even if the record changes later.
  let party: { name: string; phone: string | null; address: string | null } | null = null;
  if (input.party_id) {
    const table = input.kind === 'sale' ? 'customers' : 'suppliers';
    const row = await db.from(table).select('name,phone,address').eq('id', input.party_id).eq('shop_id', shop.id).maybeSingle();
    if (!row) throw new AppError(input.kind === 'sale' ? 'Customer not found in this shop' : 'Supplier not found in this shop', 400);
    party = row;
  }

  const invoice = await db.rpc<RowOf<'invoices'>>('post_invoice', {
    p_invoice: {
      shop_id: shop.id,
      kind: input.kind,
      customer_id: input.kind === 'sale' ? input.party_id ?? null : null,
      supplier_id: input.kind === 'purchase' ? input.party_id ?? null : null,
      party_name: party?.name ?? input.party_name,
      party_phone: party?.phone ?? input.party_phone,
      party_address: party?.address ?? input.party_address,
      invoice_date: input.invoice_date,
      payment_method: input.payment_method,
      transaction_id: input.transaction_id,
      notes: input.notes,
      subtotal: totals.subtotal,
      line_tax: totals.lineTaxAmount,
      line_discount: totals.lineDiscountAmount,
      tax_percent: totals.taxPercent,
      tax_amount: totals.taxAmount,
      discount: totals.discount,
      total: totals.total,
      paid: totals.paid,
      created_by: ctx.actor.id,
    },
    p_lines: input.lines.map((l, i) => ({
      product_id: l.product_id,
      quantity: l.quantity,
      unit_price: l.unit_price,
      tax_percent: l.tax_percent,
      discount: round2(l.discount),
      line_total: totals.lines[i]!.total,
    })),
  });
  await logActivity(db, {
    shopId: shop.id, actorType: ctx.actor.type, actorId: ctx.actor.id, action: `created ${input.kind} invoice`, entityType: 'invoices', entityId: invoice.id,
    metadata: { number: invoice.number, total: invoice.total, paid: invoice.paid },
  });
  if (invoice.kind === 'sale') {
    await autoSms(db, shop, ctx.actor.id, 'SALE', {
      sourceId: invoice.id, number: invoice.number, phone: invoice.party_phone, name: invoice.party_name, customerId: invoice.customer_id, invoiceId: invoice.id,
      total: Number(invoice.total), paid: Number(invoice.paid), due: Number(invoice.due),
    });
  }
  return invoice;
}

export async function listInvoices(db: Database, shopId: string, kind: InvoiceKind, opts: { q?: string; page?: number; from?: string; to?: string; due?: boolean }) {
  const page = opts.page ?? 1;
  const base = () => {
    let q = db.from('invoices').eq('shop_id', shopId).eq('kind', kind).search(['number', 'party_name', 'party_phone'], opts.q);
    if (opts.from) q = q.gte('invoice_date', opts.from);
    if (opts.to) q = q.lte('invoice_date', opts.to);
    if (opts.due) q = q.gt('due', 0);
    return q;
  };
  const [rows, total, sums] = await Promise.all([
    base().select('id,number,invoice_date,party_name,party_phone,total,paid,due,payment_method,created_at').order('invoice_date', 'desc').order('created_at', 'desc').limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE),
    base().count(),
    base().select('total,due'),
  ]);
  return {
    rows,
    total,
    page,
    sum: round2(sums.reduce((t, r) => t + Number(r.total), 0)),
    due: round2(sums.reduce((t, r) => t + Number(r.due), 0)),
  };
}

export interface InvoiceDetail {
  invoice: RowOf<'invoices'>;
  lines: (RowOf<'invoice_lines'> & { code: string; unit: string; returned: number })[];
  payments: RowOf<'due_payments'>[];
  returns: Pick<RowOf<'returns'>, 'id' | 'number' | 'return_date' | 'total' | 'refunded'>[];
  exchanges: Pick<RowOf<'exchanges'>, 'id' | 'number' | 'exchange_date' | 'difference' | 'settlement'>[];
}

export async function getInvoice(db: Database, shopId: string, id: string, kind?: InvoiceKind): Promise<InvoiceDetail> {
  let q = db.from('invoices').select('*').eq('id', id).eq('shop_id', shopId);
  if (kind) q = q.eq('kind', kind);
  const invoice = await q.maybeSingle();
  if (!invoice) throw notFound('Invoice');
  const [lines, payments, returns, exchanges] = await Promise.all([
    db.from('invoice_lines').select('*,products(code,unit)').eq('invoice_id', id),
    db.from('due_payments').select('*').eq('shop_id', shopId).eq('source_type', invoice.kind).eq('source_id', id).order('created_at'),
    db.from('returns').select('id,number,return_date,total,refunded').eq('invoice_id', id).order('created_at'),
    db.from('exchanges').select('id,number,exchange_date,difference,settlement').eq('invoice_id', id).order('created_at'),
  ]);
  const lineIds = lines.map((l) => l.id);
  const [returnedRows, exchangedRows] = lineIds.length
    ? await Promise.all([
        db.from('return_items').select('invoice_line_id,quantity').in('invoice_line_id', lineIds),
        db.from('exchange_items').select('invoice_line_id,quantity').eq('direction', 'returned').in('invoice_line_id', lineIds),
      ])
    : [[], []];
  const returned = new Map<string, number>();
  for (const r of [...returnedRows, ...exchangedRows]) returned.set(String(r.invoice_line_id), (returned.get(String(r.invoice_line_id)) ?? 0) + Number(r.quantity));
  return {
    invoice,
    lines: lines.map((l) => {
      const p = (l as unknown as { products: { code: string; unit: string } | null }).products;
      return { ...l, code: p?.code ?? '', unit: p?.unit ?? '', returned: returned.get(l.id) ?? 0 };
    }),
    payments,
    returns,
    exchanges,
  };
}

export async function deleteInvoice(ctx: ShopContext, id: string, kind: InvoiceKind) {
  const invoice = await ctx.db.from('invoices').select('number,total').eq('id', id).eq('shop_id', ctx.shop.id).eq('kind', kind).maybeSingle();
  if (!invoice) throw notFound('Invoice');
  await ctx.db.rpc('delete_invoice', { p_shop_id: ctx.shop.id, p_invoice_id: id });
  await logActivity(ctx.db, {
    shopId: ctx.shop.id, actorType: ctx.actor.type, actorId: ctx.actor.id, action: `deleted ${kind} invoice`, entityType: 'invoices', entityId: id,
    metadata: { number: invoice.number, total: invoice.total },
  });
}

/** Customers or suppliers for the invoice form. */
export async function partyOptions(db: Database, shopId: string, kind: InvoiceKind) {
  const table = kind === 'sale' ? 'customers' : 'suppliers';
  return db.from(table).select('id,code,name,phone').eq('shop_id', shopId).order('name').limit(2000);
}
