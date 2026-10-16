import type { Database } from '@/server/db/types';
import { sha256Hex } from './crypto';

/**
 * Brute-force protection backed by the `auth_attempts` table (both providers).
 * Subjects are hashed so no raw emails or tokens are stored.
 */

export type ThrottleScope = 'login' | 'login_ip' | 'otp' | 'reset_request' | 'reset_used' | 'contact';

export const LIMITS = {
  login: { max: 10, minutes: 15 },
  login_ip: { max: 50, minutes: 15 },
  otp: { max: 5, minutes: 15 },
  reset_request: { max: 5, minutes: 60 },
  contact: { max: 5, minutes: 60 },
} as const;

async function subjectHash(subject: string): Promise<string> {
  return (await sha256Hex(subject.toLowerCase())).slice(0, 40);
}

export async function attemptsSince(db: Database, scope: ThrottleScope, subject: string, minutes: number, cap = 100): Promise<number> {
  const since = new Date(Date.now() - minutes * 60_000).toISOString();
  const rows = await db.from('auth_attempts').select('id')
    .eq('scope', scope).eq('subject', await subjectHash(subject)).gte('created_at', since).limit(cap);
  return rows.length;
}

export async function isThrottled(db: Database, scope: keyof typeof LIMITS, subject: string): Promise<boolean> {
  const { max, minutes } = LIMITS[scope];
  return (await attemptsSince(db, scope, subject, minutes, max)) >= max;
}

export async function recordAttempt(db: Database, scope: ThrottleScope, subject: string): Promise<void> {
  await db.from('auth_attempts').insert({ scope, subject: await subjectHash(subject), created_at: new Date().toISOString() });
  // Opportunistic cleanup keeps the table small without a scheduler.
  if (Math.random() < 0.02) {
    await db.from('auth_attempts').lt('created_at', new Date(Date.now() - 86_400_000).toISOString()).delete().catch(() => undefined);
  }
}

export async function clearAttempts(db: Database, scope: ThrottleScope, subject: string): Promise<void> {
  await db.from('auth_attempts').eq('scope', scope).eq('subject', await subjectHash(subject)).delete().catch(() => undefined);
}
