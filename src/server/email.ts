import 'server-only';
import type { Database } from '@/server/db';
import type { AppEnv } from '@/server/env';
import { getSetting } from '@/server/settings';

/**
 * Transactional email through Brevo. The sender name/address come from the
 * ConnectX email settings (owner console). Returns false when email is not
 * configured or the provider rejects the message; never throws.
 */
export interface EmailMessage {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
}

/** Sends through Brevo with the platform sender. Returns false when not configured or rejected. */
export async function sendBrevo(env: AppEnv, db: Database, m: EmailMessage): Promise<boolean> {
  try {
    if (!m.to.length) return false;
    if (env.MOCK_EMAIL === '1') return true;
    if (!env.BREVO_API_KEY) return false;
    const [cfg, brand] = await Promise.all([getSetting(db, 'connectx_email'), getSetting(db, 'branding')]);
    if (!cfg.from_email) return false;
    const list = (xs?: string[]) => (xs?.length ? xs.map((email) => ({ email })) : undefined);
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': env.BREVO_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({
        sender: { name: cfg.from_name || brand.product_name, email: cfg.from_email },
        ...(cfg.reply_to ? { replyTo: { email: cfg.reply_to } } : {}),
        to: list(m.to),
        cc: list(m.cc),
        bcc: list(m.bcc),
        subject: m.subject,
        htmlContent: m.html,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Single-recipient convenience used for account emails (password reset codes). */
export function sendEmail(env: AppEnv, db: Database, to: string, subject: string, html: string): Promise<boolean> {
  return sendBrevo(env, db, { to: to ? [to] : [], subject, html });
}
