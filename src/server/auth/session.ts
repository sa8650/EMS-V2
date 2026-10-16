import 'server-only';
import { cookies, headers } from 'next/headers';
import { cache } from 'react';
import { getEnv } from '@/server/env';
import { signToken, verifyToken } from './crypto';

/**
 * Signed session cookie. The token only says who is signed in (role, id and,
 * for shop work, the shop); account status, permissions and licence state are
 * re-checked against the database on every request (see ./guards).
 */

export type Role = 'owner' | 'admin' | 'staff';

export interface Session {
  role: Role;
  id: string;
  /** Staff: their shop. Admin: the shop they are currently working in (optional). */
  shopId?: string;
  exp: number;
}

export const SESSION_COOKIE = 'ems_session';
const TTL_SECONDS: Record<Role, number> = { owner: 4 * 3600, admin: 8 * 3600, staff: 8 * 3600 };
const ROLES: readonly Role[] = ['owner', 'admin', 'staff'];

/** Signs the user in (Server Actions / Route Handlers only). */
export async function startSession(data: Omit<Session, 'exp'>): Promise<void> {
  const env = await getEnv();
  const ttl = TTL_SECONDS[data.role];
  const payload: Record<string, unknown> = { role: data.role, id: data.id, exp: Math.floor(Date.now() / 1000) + ttl };
  if (data.shopId) payload.shopId = data.shopId;
  const token = await signToken(payload, env.SESSION_SECRET);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ttl,
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

/** The current session (memoised per request), or null. */
export const getSession = cache(async (): Promise<Session | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const env = await getEnv();
  const s = await verifyToken<Session>(token, env.SESSION_SECRET);
  if (!s || !ROLES.includes(s.role) || typeof s.id !== 'string') return null;
  if (s.role === 'staff' && !s.shopId) return null;
  return s;
});

/** Client details for audit logs and device lists. */
export async function requestMeta(): Promise<{ ip: string; userAgent: string }> {
  const h = await headers();
  const ip = h.get('cf-connecting-ip') ?? h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? 'unknown';
  return { ip, userAgent: (h.get('user-agent') ?? '').slice(0, 300) };
}
