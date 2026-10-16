import 'server-only';
import { z } from 'zod';
import { round2 } from '@/lib/invoice-math';
import { logActivity } from '@/server/activity';
import type { ShopContext } from '@/server/auth/guards';
import type { Database } from '@/server/db';
import { autoSms } from '@/server/connectx/sms';
import { AppError, notFound } from '@/server/errors';
import { PAYMENT_METHODS } from './invoices';
import { PAGE_SIZE } from './records';

/** Money still owed: customers → shop (receivable), shop → suppliers / expenses (payable). */

export type DueSource = 'sale' | 'purchase' | 'expense';

export interface DueRow {
  source: DueSource;
  id: string;
  number: string;
  date: string;
  party: string | null;
  phone: string | null;
  total: number;
  paid: number;
  due: number;
}

export async function receivables(db: Database, shopId: string, q?: string): Promise<DueRow[]> {
  const rows = await db.from('invoices').select('id,number,invoice_date,party_name,party_phone,total,paid,due')
    .eq('shop_id', shopId).eq('kind', 'sale').gt('due', 0).search(['number', 'party_name', 'party_phone'], q).order('invoice_date').limit(500);
  return rows.map((r) => ({ source: 'sale', id: r.id, number: r.number, date: r.invoice_date, party: r.party_name, phone: r.party_phone, total: Number(r.total), paid: Number(r.paid), due: Number(r.due) }));
}

export async function payables(db: Database, shopId: string, q?: string): Promise<DueRow[]> {
  const [invoices, expenses] = await Promise.all([
    db.from('invoices').select('id,number,invoice_date,party_name,party_phone,total,paid,due')
      .eq('shop_id', shopId).eq('kind', 'purchase').gt('due', 0).search(['number', 'party_name', 'party_phone'], q).order('invoice_date').limit(500),
    db.from('expenses').select('id,code,expense_date,details,total,paid,due').eq('shop_id', shopId).gt('due', 0).search(['code', 'details'], q).order('expense_date').limit(500),
  ]);
  return [
    ...invoices.map((r): DueRow => ({ source: 'purchase', id: r.id, number: r.number, date: r.invoice_date, party: r.party_name, phone: r.party_phone, total: Number(r.total), paid: Number(r.paid), due: Number(r.due) })),
    ...expenses.map((r): DueRow => ({ source: 'expense', id: r.id, number: r.code, date: r.expense_date, party: r.details, phone: null, total: Number(r.total), paid: Number(r.paid), due: Number(r.due) })),
  ].sort((a, b) => a.date.localeCompare(b.date));
}

export async function paymentHistory(db: Database, shopId: string, page: number) {
  const [rows, total] = await Promise.all([
    db.from('due_payments').select('*').eq('shop_id', shopId).order('created_at', 'desc').limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE),
    db.from('due_payments').eq('shop_id', shopId).count(),
  ]);
  const invoiceIds = rows.filter((r) => r.source_type !== 'expense').map((r) => r.source_id);
  const expenseIds = rows.filter((r) => r.source_type === 'expense').map((r) => r.source_id);
  const [invoices, expenses] = await Promise.all([
    invoiceIds.length ? db.from('invoices').select('id,number,party_name').in('id', invoiceIds) : Promise.resolve([]),
    expenseIds.length ? db.from('expenses').select('id,code,details').in('id', expenseIds) : Promise.resolve([]),
  ]);
  const ref = new Map<string, { number: string; label: string | null }>([
    ...invoices.map((i) => [i.id, { number: i.number, label: i.party_name }] as const),
    ...expenses.map((e) => [e.id, { number: e.code, label: e.details }] as const),
  ]);
  return { rows: rows.map((r) => ({ ...r, ref: ref.get(r.source_id) ?? null })), total };
}

export const paymentSchema = z.object({
  source_type: z.enum(['sale', 'purchase', 'expense']),
  source_id: z.string().uuid(),
  amount: z.coerce.number({ message: 'Enter an amount' }).finite().positive('Enter an amount above 0').max(1e11).transform(round2),
  payment_method: z.enum(PAYMENT_METHODS).default('cash'),
  transaction_id: z.string().trim().max(80).optional().transform((v) => v || null),
  note: z.string().trim().max(300).optional().transform((v) => v || null),
});

/**
 * Records a payment against a due. The paid amount is updated with a
 * compare-and-set on the previous value, so two people collecting the same due
 * at once cannot both succeed.
 */
export async function recordPayment(ctx: ShopContext, input: z.infer<typeof paymentSchema>) {
  const { db, shop } = ctx;
  const isExpense = input.source_type === 'expense';
  const source = isExpense
    ? await db.from('expenses').select('id,code,total,paid,due').eq('id', input.source_id).eq('shop_id', shop.id).maybeSingle()
    : await db.from('invoices').select('id,number,total,paid,due,party_name,party_phone,customer_id').eq('id', input.source_id).eq('shop_id', shop.id).eq('kind', input.source_type).maybeSingle();
  if (!source) throw notFound(isExpense ? 'Expense' : 'Invoice');
  const due = Number(source.due);
  if (input.amount > due) throw new AppError(`Only ${due.toFixed(2)} is due.`, 400, { amount: `At most ${due.toFixed(2)}` });
  const paid = round2(Number(source.paid) + input.amount);
  const updated = isExpense
    ? await db.from('expenses').eq('id', source.id).eq('shop_id', shop.id).eq('paid', Number(source.paid)).update({ paid })
    : await db.from('invoices').eq('id', source.id).eq('shop_id', shop.id).eq('paid', Number(source.paid)).update({ paid });
  if (!updated.length) throw new AppError('This due was just changed by someone else. Please check it and try again.', 409);
  const payment = await db.from('due_payments').insertOne({ ...input, shop_id: shop.id, recorded_by: ctx.actor.id });
  const number = 'number' in source ? source.number : source.code;
  await logActivity(db, {
    shopId: shop.id, actorType: ctx.actor.type, actorId: ctx.actor.id, action: input.source_type === 'sale' ? 'collected due' : 'paid due',
    entityType: isExpense ? 'expenses' : 'invoices', entityId: source.id, metadata: { number, amount: input.amount },
  });
  if (input.source_type === 'sale' && 'party_phone' in source) {
    await autoSms(db, shop, ctx.actor.id, 'PAYMENT', {
      sourceId: payment.id, number, phone: source.party_phone, name: source.party_name, customerId: source.customer_id, invoiceId: source.id,
      amount: input.amount, due: round2(due - input.amount),
    });
  }
  return { payment, number, remaining: round2(due - input.amount) };
}
