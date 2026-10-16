import 'server-only';
import { z } from 'zod';
import { logActivity } from '@/server/activity';
import type { Database } from '@/server/db';
import { sendEmail } from '@/server/email';
import type { AppEnv } from '@/server/env';
import { AppError } from '@/server/errors';
import { getSetting } from '@/server/settings';
import { hashPassword, sha256Hex, signToken, verifyPassword, verifyToken } from './crypto';
import type { Session } from './session';
import { attemptsSince, clearAttempts, isThrottled, recordAttempt } from './throttle';

/** Sign-in, registration, first-owner setup and password reset. */

export interface RequestMeta {
  ip: string;
  userAgent: string;
}

const email = z.string().trim().toLowerCase().email('Enter a valid email address').max(120);
const password = z.string().min(10, 'Use at least 10 characters').max(200);

export const schemas = {
  adminLogin: z.object({ email, password: z.string().min(1, 'Enter your password') }),
  staffLogin: z.object({
    shopCode: z.string().trim().regex(/^\d{4}$/, 'Shop ID is 4 digits'),
    userId: z.string().trim().toLowerCase().min(1, 'Enter your user ID').max(120),
    password: z.string().min(1, 'Enter your password'),
  }),
  register: z.object({
    name: z.string().trim().min(2, 'Enter your name').max(80),
    email,
    phone: z.string().trim().min(6, 'Enter a phone number').max(30),
    password,
  }),
  setup: z.object({
    name: z.string().trim().min(2, 'Enter your name').max(80),
    email,
    password: z.string().min(12, 'Use at least 12 characters').max(200),
  }),
  resetRequest: z.object({
    type: z.enum(['owner', 'admin', 'staff']),
    email,
    shopCode: z.string().trim().optional(),
  }),
  resetConfirm: z.object({
    token: z.string().min(10),
    code: z.string().trim().regex(/^\d{6}$/, 'The code has 6 digits'),
    password,
  }),
};

type Signed = Omit<Session, 'exp'>;

const WRONG = 'Wrong email or password.';

async function guardLogin(db: Database, subject: string, meta: RequestMeta): Promise<void> {
  if ((await isThrottled(db, 'login', subject)) || (await isThrottled(db, 'login_ip', meta.ip))) {
    throw new AppError('Too many sign-in attempts. Please wait 15 minutes and try again.', 429);
  }
}

async function failLogin(db: Database, subject: string, meta: RequestMeta, message: string): Promise<never> {
  await recordAttempt(db, 'login', subject);
  await recordAttempt(db, 'login_ip', meta.ip);
  throw new AppError(message, 401);
}

export async function signInOwner(db: Database, input: z.infer<typeof schemas.adminLogin>, meta: RequestMeta): Promise<Signed> {
  const subject = `owner:${input.email}`;
  await guardLogin(db, subject, meta);
  const owner = await db.from('platform_owners').select('*').eq('email', input.email).maybeSingle();
  if (!owner || !(await verifyPassword(input.password, owner.password_hash))) return failLogin(db, subject, meta, WRONG);
  if (!owner.active) throw new AppError('This account is deactivated.', 403);
  await clearAttempts(db, 'login', subject);
  await logActivity(db, { actorType: 'owner', actorId: owner.id, action: 'signed in', entityType: 'session', metadata: { ip: meta.ip } });
  return { role: 'owner', id: owner.id };
}

export async function signInAdmin(db: Database, input: z.infer<typeof schemas.adminLogin>, meta: RequestMeta): Promise<Signed> {
  const subject = `admin:${input.email}`;
  await guardLogin(db, subject, meta);
  const admin = await db.from('admins').select('*').eq('email', input.email).maybeSingle();
  if (!admin || !(await verifyPassword(input.password, admin.password_hash))) return failLogin(db, subject, meta, WRONG);
  if (!admin.active) throw new AppError('Your administrator account is deactivated. Contact support.', 403);
  await clearAttempts(db, 'login', subject);
  await logActivity(db, { adminId: admin.id, actorType: 'admin', actorId: admin.id, action: 'signed in', entityType: 'session', metadata: { ip: meta.ip } });
  return { role: 'admin', id: admin.id };
}

/** Shop staff sign in with Shop ID + user ID; the shop's administrator may use their email instead. */
export async function signInShop(db: Database, input: z.infer<typeof schemas.staffLogin>, meta: RequestMeta): Promise<Signed> {
  const subject = `shop:${input.shopCode}:${input.userId}`;
  await guardLogin(db, subject, meta);
  const shop = await db.from('shops').select('id,admin_id,active').eq('shop_code', input.shopCode).maybeSingle();
  const wrong = 'Wrong Shop ID, user ID or password.';
  if (!shop) return failLogin(db, subject, meta, wrong);

  const staff = await db.from('staff').select('id,full_name,active,password_hash').eq('shop_id', shop.id).eq('user_id', input.userId).maybeSingle();
  if (staff) {
    if (!(await verifyPassword(input.password, staff.password_hash))) return failLogin(db, subject, meta, wrong);
    if (!staff.active) throw new AppError('Your account is deactivated. Contact your shop administrator.', 403);
    if (!shop.active) throw new AppError('This shop is deactivated. Contact the administrator.', 403);
    await clearAttempts(db, 'login', subject);
    await recordDevice(db, shop.id, staff.id, meta);
    await logActivity(db, { shopId: shop.id, actorType: 'staff', actorId: staff.id, action: 'signed in', entityType: 'session', metadata: { ip: meta.ip } });
    return { role: 'staff', id: staff.id, shopId: shop.id };
  }

  const admin = await db.from('admins').select('id,active,password_hash').eq('id', shop.admin_id).eq('email', input.userId).maybeSingle();
  if (!admin || !(await verifyPassword(input.password, admin.password_hash))) return failLogin(db, subject, meta, wrong);
  if (!admin.active) throw new AppError('Your administrator account is deactivated. Contact support.', 403);
  await clearAttempts(db, 'login', subject);
  await recordDevice(db, shop.id, null, meta);
  await logActivity(db, { shopId: shop.id, adminId: admin.id, actorType: 'admin', actorId: admin.id, action: 'signed in to shop', entityType: 'shop', entityId: shop.id });
  return { role: 'admin', id: admin.id, shopId: shop.id };
}

async function recordDevice(db: Database, shopId: string, staffId: string | null, meta: RequestMeta): Promise<void> {
  const fingerprint = (await sha256Hex(`${meta.ip}|${meta.userAgent}`)).slice(0, 32);
  await db.from('shop_devices')
    .upsert({ shop_id: shopId, staff_id: staffId, fingerprint, user_agent: meta.userAgent, last_seen_at: new Date().toISOString() }, { onConflict: 'shop_id,fingerprint' })
    .catch((e) => console.error('[ems] device record failed', e));
}

/** A random, unused 4-digit code for admins or shops. */
export async function uniqueCode(db: Database, table: 'admins' | 'shops'): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const code = String(1000 + (crypto.getRandomValues(new Uint32Array(1))[0]! % 9000));
    const taken = table === 'admins'
      ? await db.from('admins').eq('admin_code', code).count()
      : await db.from('shops').eq('shop_code', code).count();
    if (!taken) return code;
  }
  throw new AppError('Could not reserve a code. Please try again.', 503);
}

export async function registerAdmin(db: Database, input: z.infer<typeof schemas.register>): Promise<Signed> {
  if (await db.from('admins').eq('email', input.email).count()) {
    throw new AppError('That email is already registered.', 409, { email: 'Already registered. Sign in instead.' });
  }
  const admin = await db.from('admins').insertOne({
    admin_code: await uniqueCode(db, 'admins'),
    name: input.name,
    email: input.email,
    phone: input.phone,
    password_hash: await hashPassword(input.password),
  });
  await logActivity(db, { adminId: admin.id, actorType: 'admin', actorId: admin.id, action: 'registered', entityType: 'admin', entityId: admin.id });
  return { role: 'admin', id: admin.id };
}

export async function ownerExists(db: Database): Promise<boolean> {
  return (await db.from('platform_owners').count()) > 0;
}

/** Creates the platform owner; only possible while none exists. */
export async function createFirstOwner(db: Database, input: z.infer<typeof schemas.setup>): Promise<Signed> {
  if (await ownerExists(db)) throw new AppError('The platform owner has already been set up. Sign in instead.', 409);
  // The settings primary key makes this a one-time lock, even for simultaneous requests.
  try {
    await db.from('settings').insert({ key: 'owner_setup', value: { at: new Date().toISOString() } });
  } catch {
    throw new AppError('The platform owner has already been set up. Sign in instead.', 409);
  }
  try {
    const owner = await db.from('platform_owners').insertOne({ name: input.name, email: input.email, password_hash: await hashPassword(input.password) });
    await logActivity(db, { actorType: 'owner', actorId: owner.id, action: 'platform set up', entityType: 'owner', entityId: owner.id });
    return { role: 'owner', id: owner.id };
  } catch (e) {
    await db.from('settings').eq('key', 'owner_setup').delete();
    throw e;
  }
}

/* ───────────────────────────── password reset ───────────────────────────── */

interface ResetClaims {
  purpose: 'reset';
  type: 'owner' | 'admin' | 'staff';
  email: string;
  shopId?: string;
  codeHash: string;
  exp: number;
}

const codeHash = (secret: string, email: string, code: string) => sha256Hex(`reset:${secret}:${email}:${code}`);
const tokenKey = async (token: string) => `reset:${(await sha256Hex(token)).slice(0, 40)}`;

/**
 * Emails a 6-digit code and returns a signed token for the confirm step. For
 * unknown accounts a token is returned too (no email), so the form behaves the
 * same and does not reveal which addresses are registered.
 */
export async function requestPasswordReset(db: Database, env: AppEnv, input: z.infer<typeof schemas.resetRequest>): Promise<string> {
  if (await isThrottled(db, 'reset_request', input.email)) throw new AppError('Too many reset requests. Please try again later.', 429);
  await recordAttempt(db, 'reset_request', input.email);

  let found: { email: string; shopId?: string } | null = null;
  if (input.type === 'owner') {
    if (await db.from('platform_owners').eq('email', input.email).eq('active', true).count()) found = { email: input.email };
  } else if (input.type === 'admin') {
    if (await db.from('admins').eq('email', input.email).eq('active', true).count()) found = { email: input.email };
  } else {
    const shop = await db.from('shops').select('id').eq('shop_code', input.shopCode ?? '').maybeSingle();
    if (shop && (await db.from('staff').eq('shop_id', shop.id).eq('email', input.email).eq('active', true).count())) found = { email: input.email, shopId: shop.id };
  }

  const code = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0]! % 900000));
  const claims: Omit<ResetClaims, 'exp'> & { exp: number } = {
    purpose: 'reset',
    type: input.type,
    email: input.email,
    ...(found?.shopId ? { shopId: found.shopId } : {}),
    // Unknown accounts get a hash no code can match.
    codeHash: found ? await codeHash(env.SESSION_SECRET, input.email, code) : await sha256Hex(crypto.randomUUID()),
    exp: Math.floor(Date.now() / 1000) + 600,
  };
  if (found) {
    const brand = await getSetting(db, 'branding');
    await sendEmail(env, db, found.email, `${brand.product_name} password reset code`,
      `<div style="font-family:system-ui,Arial,sans-serif;color:#0f172a;line-height:1.6">
        <h2 style="margin:0 0 8px">Password reset</h2>
        <p>Use this code to set a new password. It expires in 10 minutes.</p>
        <p style="font-size:28px;letter-spacing:6px;font-weight:700">${code}</p>
        <p style="color:#64748b;font-size:13px">If you did not ask for this, you can ignore this email.</p>
      </div>`);
  }
  return signToken(claims as unknown as Record<string, unknown>, env.SESSION_SECRET);
}

export async function confirmPasswordReset(db: Database, env: AppEnv, input: z.infer<typeof schemas.resetConfirm>): Promise<void> {
  const claims = await verifyToken<ResetClaims>(input.token, env.SESSION_SECRET);
  if (!claims || claims.purpose !== 'reset') throw new AppError('This reset link has expired. Request a new code.', 400);
  const key = await tokenKey(input.token);
  if (await attemptsSince(db, 'reset_used', key, 15, 1)) throw new AppError('This code has already been used. Request a new code.', 400);
  if (await isThrottled(db, 'otp', key)) throw new AppError('Too many wrong codes. Request a new code.', 429);
  if ((await codeHash(env.SESSION_SECRET, claims.email, input.code)) !== claims.codeHash) {
    await recordAttempt(db, 'otp', key);
    throw new AppError('That code is not correct.', 400, { code: 'Check the code in the email.' });
  }
  const password_hash = await hashPassword(input.password);
  if (claims.type === 'owner') await db.from('platform_owners').eq('email', claims.email).update({ password_hash });
  else if (claims.type === 'admin') await db.from('admins').eq('email', claims.email).update({ password_hash });
  else if (claims.shopId) await db.from('staff').eq('shop_id', claims.shopId).eq('email', claims.email).update({ password_hash });
  await recordAttempt(db, 'reset_used', key);
}
