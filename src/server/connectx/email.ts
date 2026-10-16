import 'server-only';
import { z } from 'zod';
import { formatDate } from '@/lib/format';
import { instantRange, today } from '@/lib/dates';
import { logActivity } from '@/server/activity';
import type { ShopContext } from '@/server/auth/guards';
import type { Database, RowOf } from '@/server/db';
import { sendBrevo } from '@/server/email';
import type { AppEnv } from '@/server/env';
import { AppError, notFound } from '@/server/errors';
import { addonAllowance } from '@/server/licensing';
import { getSetting } from '@/server/settings';
import { siteOrigin } from '@/server/site';
import { cancelRemoteSms } from '@/server/connect-app/service';
import { connectxRemaining, enqueueSms, smsSettingsFor, SMS_EVENTS, type SmsEvent } from './sms';
import { documentSlip, escapeHtml } from './slips';

/** ConnectX: email from the shop (with document slips) and manual SMS. */

const emails = (v: string | undefined) => (v ?? '').split(/[;,\s]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
const validEmail = (x: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x);

export const emailSchema = z.object({
  recipient: z.string().max(80).optional().transform((v) => v || ''),
  to: z.string().max(1000).optional(),
  cc: z.string().max(1000).optional(),
  subject: z.string().trim().min(2, 'Enter a subject').max(200),
  message: z.string().trim().max(5000).optional().transform((v) => v || ''),
  document: z.string().trim().toUpperCase().max(30).optional().transform((v) => v || ''),
});

async function documentHtml(db: Database, shop: RowOf<'shops'>, number: string): Promise<{ html: string; invoiceId: string | null } | null> {
  const truebill = await addonAllowance(db, shop.admin_id, 'truebill');
  const origin = await siteOrigin();
  const verify = (token: string) => (truebill ? `${origin}/verify/${token}` : undefined);
  const inv = await db.from('invoices').select('*').eq('shop_id', shop.id).eq('number', number).maybeSingle();
  if (inv) {
    const lines = await db.from('invoice_lines').select('product_name,quantity,unit_price,line_total').eq('invoice_id', inv.id);
    return {
      invoiceId: inv.id,
      html: documentSlip({
        shop, title: inv.kind === 'sale' ? 'Invoice' : 'Purchase', number: inv.number, date: formatDate(inv.invoice_date), party: inv.party_name,
        lines: lines.map((l) => ({ name: l.product_name, quantity: Number(l.quantity), unitPrice: Number(l.unit_price), total: Number(l.line_total) })),
        totals: [['Total', inv.total], ['Paid', inv.paid], ['Due', inv.due]], verifyUrl: inv.kind === 'sale' ? verify(inv.verification_token) : undefined,
      }),
    };
  }
  const ret = await db.from('returns').select('*').eq('shop_id', shop.id).eq('number', number).maybeSingle();
  if (ret) {
    const items = await db.from('return_items').select('quantity,unit_price,amount,reason,products(name)').eq('return_id', ret.id);
    return {
      invoiceId: ret.invoice_id,
      html: documentSlip({
        shop, title: 'Return', number: ret.number, date: formatDate(ret.return_date), party: ret.customer_name,
        lines: items.map((i) => ({ name: (i as unknown as { products: { name: string } | null }).products?.name ?? 'Item', quantity: Number(i.quantity), unitPrice: Number(i.unit_price), total: Number(i.amount), note: i.reason.replace('_', ' ') })),
        totals: [['Return value', ret.total], ['Refunded', ret.refunded]], verifyUrl: verify(ret.verification_token),
      }),
    };
  }
  const ex = await db.from('exchanges').select('*').eq('shop_id', shop.id).eq('number', number).maybeSingle();
  if (ex) {
    const items = await db.from('exchange_items').select('direction,quantity,unit_price,total,products(name)').eq('exchange_id', ex.id);
    return {
      invoiceId: ex.invoice_id,
      html: documentSlip({
        shop, title: 'Exchange', number: ex.number, date: formatDate(ex.exchange_date), party: ex.customer_name,
        lines: items.map((i) => ({ name: (i as unknown as { products: { name: string } | null }).products?.name ?? 'Item', quantity: Number(i.quantity), unitPrice: Number(i.unit_price), total: Number(i.total), note: i.direction === 'returned' ? 'Came back' : 'Given' })),
        totals: [['Came back', ex.returned_total], ['Replacement', ex.new_total], [ex.settlement === 'payment' ? 'Customer paid' : ex.settlement === 'refund' ? 'Refunded' : 'Difference', Math.abs(Number(ex.difference))]],
        verifyUrl: verify(ex.verification_token),
      }),
    };
  }
  return null;
}

export async function sendShopEmail(ctx: ShopContext, env: AppEnv, input: z.infer<typeof emailSchema>) {
  const { db, shop } = ctx;
  const setting = await getSetting(db, 'connectx_email');
  if (!setting.enabled) throw new AppError('Email is switched off by the platform owner.', 403);
  if (!env.BREVO_API_KEY || !setting.from_email) throw new AppError('Email is not configured on this server yet.', 503);
  const quota = await connectxRemaining(db, shop);
  if (!quota) throw new AppError('ConnectX is not active for this shop.', 403);
  if (quota.remaining <= 0) throw new AppError(`Today's limit of ${quota.limit} messages has been reached.`, 429);
  if (setting.global_daily_limit > 0) {
    const sent = await db.from('email_messages').gte('created_at', instantRange(today(), today()).start).count();
    if (sent >= setting.global_daily_limit) throw new AppError('The platform-wide daily email limit has been reached.', 429);
  }

  let recipientType: 'customer' | 'supplier' | 'manual' = 'manual';
  let recipientId: string | null = null;
  let to = emails(input.to);
  const [kind, id] = input.recipient.split(':');
  if ((kind === 'customer' || kind === 'supplier') && id) {
    const row = kind === 'customer'
      ? await db.from('customers').select('id,email').eq('id', id).eq('shop_id', shop.id).maybeSingle()
      : await db.from('suppliers').select('id,email').eq('id', id).eq('shop_id', shop.id).maybeSingle();
    if (!row) throw notFound(kind === 'customer' ? 'Customer' : 'Supplier');
    if (!row.email) throw new AppError(`This ${kind} has no email address.`, 400, { recipient: 'No email on file' });
    recipientType = kind;
    recipientId = row.id;
    to = [row.email, ...to];
  }
  const cc = emails(input.cc);
  const bad = [...to, ...cc].find((x) => !validEmail(x));
  if (bad) throw new AppError(`${bad} is not a valid email address.`, 400, { to: 'Check the addresses' });
  if (!to.length) throw new AppError('Choose a recipient or enter an email address.', 400, { to: 'Required' });
  if (to.length + cc.length > 10) throw new AppError('Send to at most 10 addresses at once.', 400);

  const doc = input.document ? await documentHtml(db, shop, input.document) : null;
  if (input.document && !doc) throw new AppError(`No invoice, return or exchange ${input.document} in this shop.`, 400, { document: 'Not found' });
  const html = `<div style="font-family:Arial,sans-serif;color:#141414;line-height:1.6">${input.message.split(/\n{2,}/).map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('')}</div>${doc?.html ?? ''}`;
  const ok = await sendBrevo(env, db, { to, cc, subject: input.subject, html });
  await db.from('email_messages').insert({
    shop_id: shop.id, sent_by: ctx.actor.id, recipient_type: recipientType, recipient_id: recipientId, invoice_id: doc?.invoiceId ?? null,
    from_email: setting.from_email, to_emails: to, cc_emails: cc, subject: input.subject, custom_body: input.message, body_html: html, provider: 'brevo',
    status: ok ? 'sent' : 'failed', error: ok ? null : 'The email provider did not accept the message.', idempotency_key: crypto.randomUUID(), sent_at: ok ? new Date().toISOString() : null,
  });
  await logActivity(db, { shopId: shop.id, actorType: ctx.actor.type, actorId: ctx.actor.id, action: ok ? 'sent email' : 'email failed', entityType: 'email_messages', metadata: { subject: input.subject } });
  if (!ok) throw new AppError('The email could not be sent. It has been recorded as failed.', 502);
}

export async function emailHistory(db: Database, shopId: string) {
  return db.from('email_messages').select('id,subject,to_emails,status,error,created_at').eq('shop_id', shopId).is('hidden_at', null).order('created_at', 'desc').limit(50);
}

export async function hideEmail(ctx: ShopContext, id: string) {
  await ctx.db.from('email_messages').eq('id', id).eq('shop_id', ctx.shop.id).update({ hidden_at: new Date().toISOString(), hidden_by: ctx.actor.id });
}

export const smsSchema = z.object({
  phone: z.string().trim().min(6, 'Enter a phone number').max(20),
  message: z.string().trim().min(2, 'Write a message').max(700),
});

export async function sendManualSms(ctx: ShopContext, input: z.infer<typeof smsSchema>) {
  const r = await enqueueSms(ctx.db, { shop: ctx.shop, sentBy: ctx.actor.id, phone: input.phone, recipientType: 'manual', event: 'MANUAL', body: input.message, idempotencyKey: `MANUAL:${crypto.randomUUID()}` });
  if ('skipped' in r) {
    const why = { no_phone: 'Enter a valid phone number.', sms_disabled: 'SMS is switched off in the settings.', no_allowance: 'ConnectX is not active for this shop.', limit: "Today's message limit has been reached.", duplicate: 'This message was already queued.', error: 'The SMS could not be queued.' }[r.skipped];
    throw new AppError(why, r.skipped === 'limit' ? 429 : 400);
  }
  return r.requestId;
}

export async function smsHistory(db: Database, shopId: string) {
  return db.from('sms_messages').select('id,request_id,to_phone,recipient_name,event_type,body,status,error,created_at,sent_at').eq('shop_id', shopId).order('created_at', 'desc').limit(50);
}

export async function cancelSms(ctx: ShopContext, id: string) {
  const row = await ctx.db.from('sms_messages').select('id,status,request_id').eq('id', id).eq('shop_id', ctx.shop.id).maybeSingle();
  if (!row) throw notFound('SMS');
  if (row.status !== 'queued' && row.status !== 'sending') throw new AppError('Only waiting messages can be cancelled.', 409);
  await ctx.db.from('sms_messages').eq('id', id).update({ status: 'cancelled' });
  if (row.request_id) await cancelRemoteSms(ctx.db, row.request_id).catch(() => undefined);
}

export async function saveSmsSettings(ctx: ShopContext, form: FormData) {
  const flag = (k: string) => form.get(k) === 'on';
  const templates: Partial<Record<SmsEvent, string>> = {};
  for (const e of SMS_EVENTS) {
    const t = String(form.get(`template:${e}`) ?? '').trim().slice(0, 500);
    if (t) templates[e] = t;
  }
  await ctx.db.from('sms_settings').upsert({
    shop_id: ctx.shop.id, enabled: flag('enabled'), auto_sale: flag('auto_sale'), auto_payment: flag('auto_payment'), auto_due_reminder: flag('auto_due_reminder'),
    auto_return: flag('auto_return'), auto_exchange: flag('auto_exchange'), auto_refund: flag('auto_refund'), templates,
  }, { onConflict: 'shop_id' });
}

export { smsSettingsFor };
