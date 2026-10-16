import 'server-only';
import { round2 } from '@/lib/invoice-math';
import { addDays, monthRange, today } from '@/lib/dates';
import type { Database } from '@/server/db';
import { currentEntitlement } from '@/server/licensing';

const sum = (rows: { [k: string]: unknown }[], key: string) => round2(rows.reduce((t, r) => t + Number(r[key] ?? 0), 0));

/** Owner console: platform-wide counts and the newest administrators. */
export async function ownerOverview(db: Database) {
  const now = new Date().toISOString();
  const [admins, shops, activeLicences, pendingLicences, pendingAddons, newMessages, unreadHelp, recentAdmins, recentLicences] = await Promise.all([
    db.from('admins').count(),
    db.from('shops').count(),
    db.from('licenses').eq('status', 'active').gt('expires_at', now).count(),
    db.from('licenses').eq('status', 'pending').count(),
    db.from('addon_purchases').eq('status', 'pending').count(),
    db.from('contact_messages').eq('status', 'new').count(),
    db.from('helpdesk_messages').eq('sender', 'admin').eq('read_by_owner', false).count(),
    db.from('admins').select('id,name,email,admin_code,active,created_at').order('created_at', 'desc').limit(6),
    db.from('licenses').select('id,title,status,amount,created_at,admins(name)').order('created_at', 'desc').limit(6),
  ]);
  return { admins, shops, activeLicences, pendingLicences, pendingAddons, newMessages, unreadHelp, recentAdmins, recentLicences };
}

/** Administrator console: licence state and shops (with which ones are within the licence). */
export async function adminOverview(db: Database, adminId: string) {
  const [entitlement, shops, pendingLicences, unreadHelp] = await Promise.all([
    currentEntitlement(db, adminId),
    db.from('shops').select('id,name,shop_code,category,active,created_at').eq('admin_id', adminId).order('created_at').order('id'),
    db.from('licenses').eq('admin_id', adminId).eq('status', 'pending').count(),
    db.from('helpdesk_messages').eq('admin_id', adminId).eq('sender', 'owner').eq('read_by_admin', false).count(),
  ]);
  const limit = entitlement?.maxShops ?? 0;
  let used = 0;
  return {
    entitlement,
    pendingLicences,
    unreadHelp,
    shops: shops.map((s) => ({ ...s, readOnly: !s.active || ++used > limit })),
  };
}

/** Shop dashboard: today, this month, the last 14 days of sales, dues and low stock. */
export async function shopDashboard(db: Database, shop: { id: string; low_stock_threshold: number }) {
  const day = today();
  const from14 = addDays(day, -13);
  const month = monthRange(day);
  const [sales14, monthPurchases, monthExpenses, receivable, payableInvoices, payableExpenses, lowStock, recent, products] = await Promise.all([
    db.from('invoices').select('invoice_date,total').eq('shop_id', shop.id).eq('kind', 'sale').gte('invoice_date', from14 < month.from ? from14 : month.from),
    db.from('invoices').select('total').eq('shop_id', shop.id).eq('kind', 'purchase').gte('invoice_date', month.from).lte('invoice_date', month.to),
    db.from('expenses').select('total').eq('shop_id', shop.id).gte('expense_date', month.from).lte('expense_date', month.to),
    db.from('invoices').select('due').eq('shop_id', shop.id).eq('kind', 'sale').gt('due', 0),
    db.from('invoices').select('due').eq('shop_id', shop.id).eq('kind', 'purchase').gt('due', 0),
    db.from('expenses').select('due').eq('shop_id', shop.id).gt('due', 0),
    db.from('products').select('id,code,name,stock,unit').eq('shop_id', shop.id).eq('active', true).lte('stock', shop.low_stock_threshold).order('stock').limit(8),
    db.from('invoices').select('id,kind,number,invoice_date,total,due,party_name,customers(name),suppliers(name)').eq('shop_id', shop.id).order('created_at', 'desc').limit(6),
    db.from('products').eq('shop_id', shop.id).eq('active', true).count(),
  ]);
  const byDay = new Map<string, number>();
  for (const r of sales14) byDay.set(r.invoice_date, round2((byDay.get(r.invoice_date) ?? 0) + Number(r.total)));
  const trend = Array.from({ length: 14 }, (_, i) => {
    const d = addDays(from14, i);
    return { date: d, total: byDay.get(d) ?? 0 };
  });
  const monthSales = sales14.filter((r) => r.invoice_date >= month.from && r.invoice_date <= month.to);
  const todaySales = sales14.filter((r) => r.invoice_date === day);
  return {
    today: { total: sum(todaySales, 'total'), count: todaySales.length },
    month: { sales: sum(monthSales, 'total'), purchases: sum(monthPurchases, 'total'), expenses: sum(monthExpenses, 'total') },
    receivable: sum(receivable, 'due'),
    payable: round2(sum(payableInvoices, 'due') + sum(payableExpenses, 'due')),
    trend,
    lowStock,
    recent,
    activeProducts: products,
  };
}
