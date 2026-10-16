import 'server-only';
import { round2 } from '@/lib/invoice-math';
import { eachDay, instantRange } from '@/lib/dates';
import type { Database } from '@/server/db';
import { PAGE_SIZE } from './records';

/**
 * Period report for one shop. Products carry no cost price, so no profit figure
 * is shown — only amounts that are actually recorded.
 */
export async function periodReport(db: Database, shopId: string, from: string, to: string) {
  const { start, end } = instantRange(from, to);
  const [sales, purchases, returns, exchanges, expenses, payments] = await Promise.all([
    db.from('invoices').select('id,invoice_date,total,paid,due').eq('shop_id', shopId).eq('kind', 'sale').gte('invoice_date', from).lte('invoice_date', to),
    db.from('invoices').select('total,paid,due').eq('shop_id', shopId).eq('kind', 'purchase').gte('invoice_date', from).lte('invoice_date', to),
    db.from('returns').select('total,refunded').eq('shop_id', shopId).gte('return_date', from).lte('return_date', to),
    db.from('exchanges').select('difference').eq('shop_id', shopId).gte('exchange_date', from).lte('exchange_date', to),
    db.from('expenses').select('total,paid').eq('shop_id', shopId).gte('expense_date', from).lte('expense_date', to),
    db.from('due_payments').select('source_type,amount').eq('shop_id', shopId).gte('created_at', start).lt('created_at', end),
  ]);
  const sum = <T extends Record<string, unknown>>(rows: T[], key: keyof T) => round2(rows.reduce((t, r) => t + Number(r[key] ?? 0), 0));

  const byDay = new Map<string, number>();
  for (const s of sales) byDay.set(s.invoice_date, round2((byDay.get(s.invoice_date) ?? 0) + Number(s.total)));
  const days = eachDay(from, to);
  const trend = days.length <= 62 ? days.map((d) => ({ date: d, total: byDay.get(d) ?? 0 })) : [];

  const saleIds = sales.map((s) => s.id);
  const top = new Map<string, { name: string; qty: number; amount: number }>();
  for (let i = 0; i < saleIds.length; i += 80) {
    const lines = await db.from('invoice_lines').select('product_id,product_name,quantity,line_total').in('invoice_id', saleIds.slice(i, i + 80));
    for (const l of lines) {
      const e = top.get(l.product_id) ?? { name: l.product_name, qty: 0, amount: 0 };
      e.qty += Number(l.quantity);
      e.amount = round2(e.amount + Number(l.line_total));
      top.set(l.product_id, e);
    }
  }

  const salesTotal = sum(sales, 'total');
  const refunded = sum(returns, 'refunded');
  const exchangeNet = round2(exchanges.reduce((t, e) => t + Number(e.difference), 0));
  return {
    sales: { count: sales.length, total: salesTotal, paidAtSale: sum(sales, 'paid'), due: sum(sales, 'due') },
    returns: { count: returns.length, value: sum(returns, 'total'), refunded },
    exchanges: { count: exchanges.length, net: exchangeNet },
    netSales: round2(salesTotal - sum(returns, 'total') + exchangeNet),
    purchases: { count: purchases.length, total: sum(purchases, 'total'), due: sum(purchases, 'due') },
    expenses: { count: expenses.length, total: sum(expenses, 'total') },
    collected: round2(payments.filter((p) => p.source_type === 'sale').reduce((t, p) => t + Number(p.amount), 0)),
    paidOut: round2(payments.filter((p) => p.source_type !== 'sale').reduce((t, p) => t + Number(p.amount), 0)),
    trend,
    topProducts: [...top.values()].sort((a, b) => b.amount - a.amount).slice(0, 10),
  };
}

/** The shop's audit log with readable actor names. */
export async function activityLog(db: Database, shop: { id: string; admin_id: string }, page: number) {
  const [rows, total] = await Promise.all([
    db.from('activity_logs').select('*').eq('shop_id', shop.id).order('created_at', 'desc').limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE),
    db.from('activity_logs').eq('shop_id', shop.id).count(),
  ]);
  const staffIds = [...new Set(rows.filter((r) => r.actor_type === 'staff' && r.actor_id).map((r) => r.actor_id!))];
  const [staff, admin] = await Promise.all([
    staffIds.length ? db.from('staff').select('id,full_name').in('id', staffIds) : Promise.resolve([]),
    db.from('admins').select('id,name').eq('id', shop.admin_id).maybeSingle(),
  ]);
  const names = new Map<string, string>([...staff.map((s) => [s.id, s.full_name] as const), ...(admin ? [[admin.id, admin.name] as const] : [])]);
  return {
    rows: rows.map((r) => ({ ...r, actor: (r.actor_id && names.get(r.actor_id)) || (r.actor_type === 'admin' ? 'Administrator' : r.actor_type === 'owner' ? 'Platform owner' : 'Former staff') })),
    total,
  };
}

/** Short human summary of an activity entry's details. */
export function activityDetail(metadata: unknown): string {
  const m = (metadata && typeof metadata === 'object' ? metadata : {}) as Record<string, unknown>;
  const parts = ['number', 'code', 'name', 'user_id', 'title', 'staff', 'month', 'date'].map((k) => m[k]).filter((v) => typeof v === 'string' && v);
  const amount = m.total ?? m.amount;
  if (typeof amount === 'number' || (typeof amount === 'string' && amount !== '')) parts.push(`৳${Number(amount).toFixed(2)}`);
  return parts.join(' · ');
}
