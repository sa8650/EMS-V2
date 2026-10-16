import 'server-only';
import type { Database } from '@/server/db';

/** TrueBill: public verification of invoices, returns and exchanges by their QR token. */

export interface VerifiedDocument {
  type: 'invoice' | 'return' | 'exchange';
  number: string;
  date: string;
  amount: number;
  shop: string;
  status: string;
}

const isToken = (t: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t);

/** Looks the token up and records the scan. Only non-personal details are returned. */
export async function verifyDocument(db: Database, token: string, meta: { ip: string; userAgent: string }): Promise<VerifiedDocument | null> {
  if (!isToken(token)) return null;
  const [inv, ret, ex] = await Promise.all([
    db.from('invoices').select('id,shop_id,kind,number,invoice_date,total,due').eq('verification_token', token).maybeSingle(),
    db.from('returns').select('id,shop_id,number,return_date,total,status').eq('verification_token', token).maybeSingle(),
    db.from('exchanges').select('id,shop_id,number,exchange_date,difference,status').eq('verification_token', token).maybeSingle(),
  ]);
  let doc: (VerifiedDocument & { shopId: string; id: string }) | null = null;
  if (inv && inv.kind === 'sale') doc = { type: 'invoice', id: inv.id, shopId: inv.shop_id, number: inv.number, date: inv.invoice_date, amount: Number(inv.total), shop: '', status: Number(inv.due) > 0 ? 'Partly paid' : 'Paid' };
  else if (ret) doc = { type: 'return', id: ret.id, shopId: ret.shop_id, number: ret.number, date: ret.return_date, amount: Number(ret.total), shop: '', status: ret.status.replace('_', ' ') };
  else if (ex) doc = { type: 'exchange', id: ex.id, shopId: ex.shop_id, number: ex.number, date: ex.exchange_date, amount: Math.abs(Number(ex.difference)), shop: '', status: ex.status };
  if (!doc) return null;
  const shop = await db.from('shops').select('name').eq('id', doc.shopId).maybeSingle();
  await db.from('verification_scans').insert({ shop_id: doc.shopId, document_type: doc.type, document_id: doc.id, document_number: doc.number, ip: meta.ip, user_agent: meta.userAgent })
    .catch((e) => console.error('[ems] scan log failed', e));
  return { type: doc.type, number: doc.number, date: doc.date, amount: doc.amount, shop: shop?.name ?? '', status: doc.status };
}

export async function recentScans(db: Database) {
  return db.from('verification_scans').select('*,shops(name)').order('scanned_at', 'desc').limit(200) as unknown as Promise<({ id: string; document_type: string; document_number: string | null; ip: string | null; user_agent: string | null; scanned_at: string; shops: { name: string } | null })[]>;
}
