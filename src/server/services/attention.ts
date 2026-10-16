import 'server-only';
import { round2 } from '@/lib/invoice-math';
import type { PermissionSection } from '@/lib/permissions';
import { addDays, today } from '@/lib/dates';
import { formatMoney } from '@/lib/format';
import type { Database, RowOf } from '@/server/db';
import { currentEntitlement } from '@/server/licensing';

/** "Needs attention" items for the shop and administrator dashboards (EMS 4.x notification rules). */

export interface Note {
  key: string;
  /** Shop permission needed to follow the link (shop notes only). */
  section?: PermissionSection;
  level: 'critical' | 'warning' | 'info';
  title: string;
  detail?: string;
  href: string;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
const sum = (rows: { due: number }[]) => round2(rows.reduce((t, r) => t + Number(r.due), 0));

export async function shopAttention(db: Database, shop: RowOf<'shops'>): Promise<Note[]> {
  const cutoff = addDays(today(), -30);
  const [stock, overdue, expenses, health] = await Promise.all([
    db.from('products').select('name,stock').eq('shop_id', shop.id).eq('active', true).lte('stock', shop.low_stock_threshold).order('stock').limit(100),
    db.from('invoices').select('kind,due').eq('shop_id', shop.id).gt('due', 0).lte('invoice_date', cutoff).limit(500),
    db.from('expenses').select('due').eq('shop_id', shop.id).gt('due', 0).lte('expense_date', cutoff).limit(500),
    db.from('business_health_reports').select('score').eq('shop_id', shop.id).order('created_at', 'desc').limit(1).maybeSingle(),
  ]);
  const notes: Note[] = [];
  const out = stock.filter((p) => Number(p.stock) <= 0);
  const low = stock.filter((p) => Number(p.stock) > 0);
  if (out.length) notes.push({ key: 'out', section: 'inventory', level: 'critical', title: `${out.length} ${plural(out.length, 'product is', 'products are')} out of stock`, detail: out.slice(0, 4).map((p) => p.name).join(', '), href: '/shop/inventory?stock=out' });
  if (low.length) notes.push({ key: 'low', section: 'inventory', level: 'warning', title: `${low.length} low-stock ${plural(low.length, 'product', 'products')}`, detail: low.slice(0, 4).map((p) => p.name).join(', '), href: '/shop/inventory?stock=low' });
  const sales = overdue.filter((i) => i.kind === 'sale');
  const purchases = overdue.filter((i) => i.kind === 'purchase');
  if (sales.length) notes.push({ key: 'sales', section: 'due_recover', level: 'warning', title: `${sales.length} customer ${plural(sales.length, 'invoice is', 'invoices are')} overdue by 30+ days`, detail: `${formatMoney(sum(sales))} to collect`, href: '/shop/dues' });
  if (purchases.length) notes.push({ key: 'purchases', section: 'due_recover', level: 'warning', title: `${purchases.length} supplier ${plural(purchases.length, 'bill is', 'bills are')} overdue by 30+ days`, detail: `${formatMoney(sum(purchases))} to pay`, href: '/shop/dues?tab=payable' });
  if (expenses.length) notes.push({ key: 'expenses', section: 'due_recover', level: 'info', title: `${expenses.length} ${plural(expenses.length, 'expense is', 'expenses are')} unpaid after 30+ days`, detail: formatMoney(sum(expenses)), href: '/shop/dues?tab=payable' });
  if (health && health.score < 60) notes.push({ key: 'health', section: 'report', level: health.score < 40 ? 'critical' : 'warning', title: `Business health score is ${health.score}/100`, detail: 'See the advice in the latest report.', href: '/shop/health' });
  return notes;
}

export async function adminAttention(db: Database, adminId: string): Promise<Note[]> {
  const [ent, licences, shops, unread, addons] = await Promise.all([
    currentEntitlement(db, adminId),
    db.from('licenses').select('status,review_note,created_at').eq('admin_id', adminId).order('created_at', 'desc').limit(10),
    db.from('shops').select('id,active').eq('admin_id', adminId).order('created_at').order('id'),
    db.from('helpdesk_messages').eq('admin_id', adminId).eq('sender', 'owner').eq('read_by_admin', false).count(),
    db.from('addon_purchases').eq('admin_id', adminId).eq('status', 'pending').count(),
  ]);
  const notes: Note[] = [];
  const pending = licences.filter((l) => l.status === 'pending').length;
  if (!ent) notes.push({ key: 'licence', level: 'critical', title: licences.some((l) => l.status === 'expired' || l.status === 'active') ? 'Your licence has expired' : 'No active licence yet', detail: 'Shops stay read-only until a licence is active.', href: '/admin/licenses' });
  else {
    const days = Math.ceil((new Date(ent.expiresAt).getTime() - Date.now()) / 86_400_000);
    if (days <= 14) notes.push({ key: 'expiring', level: 'warning', title: `Licence expires in ${days} ${plural(days, 'day', 'days')}`, detail: 'Renew in time to keep your shops writable.', href: '/admin/licenses' });
  }
  if (pending) notes.push({ key: 'pending', level: 'info', title: 'Your licence payment is being reviewed', href: '/admin/licenses' });
  const rejected = licences[0]?.status === 'rejected' ? licences[0] : null;
  if (rejected) notes.push({ key: 'rejected', level: 'warning', title: 'Your last licence payment was rejected', detail: rejected.review_note ?? undefined, href: '/admin/licenses' });
  const active = shops.filter((s) => s.active).length;
  if (ent && active > ent.maxShops) notes.push({ key: 'readonly', level: 'warning', title: `${active - ent.maxShops} ${plural(active - ent.maxShops, 'shop is', 'shops are')} read-only`, detail: 'Your licence covers fewer shops. Upgrade or deactivate a shop.', href: '/admin/shops' });
  else if (ent && active === ent.maxShops) notes.push({ key: 'capacity', level: 'info', title: 'All licensed shop places are in use', href: '/admin/licenses' });
  if (unread) notes.push({ key: 'helpdesk', level: unread > 2 ? 'warning' : 'info', title: `${unread} unread help desk ${plural(unread, 'reply', 'replies')}`, href: '/admin/helpdesk' });
  if (addons) notes.push({ key: 'addons', level: 'info', title: `${addons} add-on ${plural(addons, 'request is', 'requests are')} waiting for review`, href: '/admin/addons' });
  return notes;
}
