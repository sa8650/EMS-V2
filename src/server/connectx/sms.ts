import 'server-only';
import { instantRange, today } from '@/lib/dates';
import type { Database, RowOf } from '@/server/db';
import { addonAllowance } from '@/server/licensing';
import { dispatchSmsRecord, insertSmsRow, nextSmsRequestId } from '@/server/connect-app/service';

/**
 * ConnectX SMS: per-shop settings and templates, and the outgoing queue. SMS
 * leaves EMS only through the paired Connect App (the shop's Android phone).
 * Email and SMS together count against the shop's ConnectX daily allowance.
 */

export const SMS_EVENTS = ['SALE', 'PAYMENT', 'DUE_REMINDER', 'RETURN', 'EXCHANGE', 'REFUND', 'TEST'] as const;
export type SmsEvent = (typeof SMS_EVENTS)[number];
export type AutoEvent = Exclude<SmsEvent, 'TEST' | 'DUE_REMINDER'>;

export const DEFAULT_TEMPLATES: Record<SmsEvent, string> = {
  SALE: 'Hi {name}, thanks for your purchase at {shop}. Invoice {invoice}: total BDT {total}, paid BDT {paid}, due BDT {due}.',
  PAYMENT: 'Hi {name}, {shop} received your payment of BDT {amount} for {invoice}. Remaining due: BDT {due}. Thank you.',
  DUE_REMINDER: 'Dear {name}, reminder from {shop} for invoice {invoice}. Outstanding due: BDT {due}. Please settle when convenient.',
  RETURN: 'Hi {name}, your return {invoice} at {shop} is complete. Refunded: BDT {amount}. Thank you.',
  EXCHANGE: 'Hi {name}, your exchange {invoice} at {shop} is complete. Settlement: BDT {amount}. Thank you.',
  REFUND: 'Hi {name}, {shop} issued a refund of BDT {amount} for {invoice}. Thank you.',
  TEST: 'ConnectX test from {shop}. Your SMS gateway is working.',
};

const money = (v: unknown) => Number(v || 0).toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fillTemplate = (tpl: string, vars: Record<string, string>) => tpl.replace(/\{(name|shop|invoice|total|paid|due|amount)\}/g, (_, k: string) => vars[k] ?? '');
export function cleanPhone(v: unknown): string {
  const d = String(v ?? '').replace(/[^0-9+]/g, '');
  return d.length >= 6 ? d : '';
}

export type SmsSettings = Omit<RowOf<'sms_settings'>, 'templates'> & { templates: Record<SmsEvent, string> };

export async function smsSettingsFor(db: Database, shopId: string): Promise<SmsSettings> {
  const row = await db.from('sms_settings').select('*').eq('shop_id', shopId).maybeSingle();
  const stored = row?.templates && typeof row.templates === 'object' ? (row.templates as Partial<Record<SmsEvent, string>>) : {};
  const base = row ?? {
    shop_id: shopId, enabled: false, auto_sale: true, auto_payment: true, auto_due_reminder: false, auto_return: true, auto_exchange: true, auto_refund: true,
    templates: {}, updated_at: new Date().toISOString(),
  };
  return { ...base, templates: { ...DEFAULT_TEMPLATES, ...stored } };
}

/** Messages (email + SMS) a shop may still send today, or null when ConnectX is not active. */
export async function connectxRemaining(db: Database, shop: { id: string; admin_id: string }): Promise<{ limit: number; used: number; remaining: number } | null> {
  const allowance = await addonAllowance(db, shop.admin_id, 'connectx');
  if (!allowance) return null;
  const since = instantRange(today(), today()).start;
  const [emails, sms] = await Promise.all([
    db.from('email_messages').eq('shop_id', shop.id).gte('created_at', since).count(),
    db.from('sms_messages').eq('shop_id', shop.id).gte('created_at', since).count(),
  ]);
  const used = emails + sms;
  return { limit: allowance.limit, used, remaining: Math.max(0, allowance.limit - used) };
}

export interface SmsJob {
  shop: { id: string; admin_id: string };
  sentBy?: string | null;
  phone: unknown;
  name?: string | null;
  recipientId?: string | null;
  recipientType?: 'customer' | 'supplier' | 'staff' | 'manual';
  invoiceId?: string | null;
  event?: SmsEvent | 'MANUAL';
  body: string;
  idempotencyKey: string;
}

export type SmsResult = { ok: true; id: string; requestId: string } | { skipped: 'no_phone' | 'sms_disabled' | 'no_allowance' | 'limit' | 'duplicate' | 'error'; error?: string };

export async function enqueueSms(db: Database, job: SmsJob): Promise<SmsResult> {
  const to = cleanPhone(job.phone);
  if (!to) return { skipped: 'no_phone' };
  const settings = await smsSettingsFor(db, job.shop.id);
  if (!settings.enabled && job.event !== 'MANUAL' && job.event !== 'TEST') return { skipped: 'sms_disabled' };
  const quota = await connectxRemaining(db, job.shop);
  if (!quota) return { skipped: 'no_allowance' };
  if (quota.remaining <= 0) return { skipped: 'limit' };
  if (await db.from('sms_messages').eq('shop_id', job.shop.id).eq('idempotency_key', job.idempotencyKey).count()) return { skipped: 'duplicate' };
  try {
    const requestId = await nextSmsRequestId(db);
    const record = await insertSmsRow(db, {
      shop_id: job.shop.id, sent_by: job.sentBy ?? null, recipient_type: job.recipientType ?? 'customer', recipient_id: job.recipientId ?? null,
      recipient_name: job.name ?? null, to_phone: to, message_type: job.event ?? 'MANUAL', event_type: job.event ?? null, invoice_id: job.invoiceId ?? null,
      body: job.body, status: 'PENDING', request_id: requestId, attempts: 0, idempotency_key: job.idempotencyKey,
    });
    await dispatchSmsRecord(db, record).catch((e) => console.error('[ems] SMS dispatch failed', e));
    return { ok: true, id: String(record.id), requestId };
  } catch (e) {
    if ((e as { code?: string }).code === '23505') return { skipped: 'duplicate' };
    console.error('[ems] enqueueSms', e);
    return { skipped: 'error', error: e instanceof Error ? e.message : String(e) };
  }
}

export interface AutoSmsData {
  sourceId: string;
  number: string;
  phone?: string | null;
  name?: string | null;
  customerId?: string | null;
  invoiceId?: string | null;
  total?: number;
  paid?: number;
  due?: number;
  amount?: number;
}

/** Queues the automatic SMS for a shop event when the shop switched it on. Never throws. */
export async function autoSms(db: Database, shop: { id: string; admin_id: string; name: string }, actorId: string, event: AutoEvent, d: AutoSmsData): Promise<void> {
  try {
    const settings = await smsSettingsFor(db, shop.id);
    const flag = { SALE: settings.auto_sale, PAYMENT: settings.auto_payment, RETURN: settings.auto_return, EXCHANGE: settings.auto_exchange, REFUND: settings.auto_refund }[event];
    if (!settings.enabled || !flag) return;
    let phone = d.phone ?? '';
    let name = d.name ?? 'Customer';
    if (!phone && d.customerId) {
      const c = await db.from('customers').select('name,phone').eq('id', d.customerId).eq('shop_id', shop.id).maybeSingle();
      if (c) {
        phone = c.phone ?? '';
        name = c.name;
      }
    }
    const vars = { name, shop: shop.name, invoice: d.number, total: money(d.total), paid: money(d.paid), due: money(d.due), amount: money(d.amount ?? d.paid) };
    await enqueueSms(db, {
      shop, sentBy: actorId, phone, name, recipientId: d.customerId ?? null, recipientType: 'customer', invoiceId: d.invoiceId ?? null, event,
      body: fillTemplate(settings.templates[event], vars), idempotencyKey: `${event}:${d.sourceId}`,
    });
  } catch (e) {
    console.error('[ems] auto SMS failed', event, e);
  }
}
