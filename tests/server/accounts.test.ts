import { afterEach, describe, expect, it, vi } from 'vitest';
import { hashPassword } from '@/server/auth/crypto';
import {
  confirmPasswordReset, createFirstOwner, registerAdmin, requestPasswordReset, signInAdmin, signInOwner, signInShop,
} from '@/server/auth/accounts';
import type { Database } from '@/server/db';
import type { AppEnv } from '@/server/env';
import { AppError } from '@/server/errors';
import { saveSetting } from '@/server/settings';
import { providerCases } from '../helpers/providers';

const meta = { ip: '203.0.113.7', userAgent: 'vitest' };
const env = { SESSION_SECRET: 'test-secret-'.repeat(4), BREVO_API_KEY: 'brevo-test', provider: 'd1' } as AppEnv;

async function appError(p: Promise<unknown>): Promise<AppError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof AppError) return e;
    throw e;
  }
  throw new Error('expected an AppError');
}

/** Captures outgoing Brevo emails; returns the last 6-digit code sent. */
function captureEmails() {
  const sent: { to: string; html: string }[] = [];
  const real = globalThis.fetch;
  vi.stubGlobal('fetch', async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).includes('api.brevo.com')) {
      const body = JSON.parse(String(init?.body));
      sent.push({ to: body.to[0].email, html: body.htmlContent });
      return new Response('{}', { status: 201 });
    }
    return real(url, init);
  });
  return { sent, lastCode: () => /(\d{6})<\/p>/.exec(sent.at(-1)?.html ?? '')?.[1] ?? '' };
}

afterEach(() => vi.unstubAllGlobals());

async function adminWithShop(db: Database) {
  const signed = await registerAdmin(db, { name: 'Rina Akter', email: 'rina@example.com', phone: '01700000000', password: 'correct-horse-1' });
  const shop = await db.from('shops').insertOne({ admin_id: signed.id, shop_code: '4321', name: 'Rina Store' });
  return { adminId: signed.id, shop };
}

for (const provider of providerCases()) {
  describe(`accounts: ${provider.name}`, () => {
    it('registers and signs in administrators with generic failures', async () => {
      const db = await provider.make();
      const { adminId } = await adminWithShop(db);
      const admin = await db.from('admins').select('admin_code').eq('id', adminId).single();
      expect(admin.admin_code).toMatch(/^\d{4}$/);
      expect(await signInAdmin(db, { email: 'rina@example.com', password: 'correct-horse-1' }, meta)).toEqual({ role: 'admin', id: adminId });
      expect((await appError(signInAdmin(db, { email: 'rina@example.com', password: 'nope' }, meta))).message).toBe('Wrong email or password.');
      expect((await appError(signInAdmin(db, { email: 'nobody@example.com', password: 'nope' }, meta))).message).toBe('Wrong email or password.');
      expect((await appError(registerAdmin(db, { name: 'X', email: 'rina@example.com', phone: '0170', password: 'another-pass-1' }))).status).toBe(409);
    });

    it('locks an account after 10 failed sign-ins', async () => {
      const db = await provider.make();
      await adminWithShop(db);
      for (let i = 0; i < 10; i++) await appError(signInAdmin(db, { email: 'rina@example.com', password: `wrong-${i}` }, { ...meta, ip: `198.51.100.${i}` }));
      const locked = await appError(signInAdmin(db, { email: 'rina@example.com', password: 'correct-horse-1' }, meta));
      expect(locked.status).toBe(429);
    });

    it('signs shop staff in with Shop ID + user ID, and the shop admin with their email', async () => {
      const db = await provider.make();
      const { adminId, shop } = await adminWithShop(db);
      const staff = await db.from('staff').insertOne({ shop_id: shop.id, user_id: 'cashier1', full_name: 'Cashier One', password_hash: await hashPassword('cashier-pass-1') });
      expect(await signInShop(db, { shopCode: '4321', userId: 'cashier1', password: 'cashier-pass-1' }, meta)).toEqual({ role: 'staff', id: staff.id, shopId: shop.id });
      expect(await signInShop(db, { shopCode: '4321', userId: 'rina@example.com', password: 'correct-horse-1' }, meta)).toEqual({ role: 'admin', id: adminId, shopId: shop.id });
      expect((await appError(signInShop(db, { shopCode: '9999', userId: 'cashier1', password: 'cashier-pass-1' }, meta))).status).toBe(401);

      const other = await registerAdmin(db, { name: 'Other', email: 'other@example.com', phone: '0180', password: 'other-pass-123' });
      expect(other.role).toBe('admin');
      expect((await appError(signInShop(db, { shopCode: '4321', userId: 'other@example.com', password: 'other-pass-123' }, meta))).status).toBe(401);

      await db.from('staff').eq('id', staff.id).update({ active: false });
      expect((await appError(signInShop(db, { shopCode: '4321', userId: 'cashier1', password: 'cashier-pass-1' }, meta))).status).toBe(403);
      expect(await db.from('shop_devices').eq('shop_id', shop.id).count()).toBe(1);
    });

    it('creates the platform owner only once', async () => {
      const db = await provider.make();
      const owner = await createFirstOwner(db, { name: 'Owner', email: 'owner@example.com', password: 'owner-password-1' });
      expect(owner.role).toBe('owner');
      expect((await appError(createFirstOwner(db, { name: 'Intruder', email: 'evil@example.com', password: 'owner-password-2' }))).status).toBe(409);
      expect(await signInOwner(db, { email: 'owner@example.com', password: 'owner-password-1' }, meta)).toEqual(owner);
    });

    it('resets passwords only with the emailed code, once, with a 5-try limit', async () => {
      const db = await provider.make();
      await adminWithShop(db);
      await saveSetting(db, 'connectx_email', { from_email: 'no-reply@example.com' }, null);
      const mail = captureEmails();

      const token = await requestPasswordReset(db, env, { type: 'admin', email: 'rina@example.com' });
      expect(mail.sent).toHaveLength(1);
      const code = mail.lastCode();
      expect((await appError(confirmPasswordReset(db, env, { token, code: code === '111111' ? '222222' : '111111', password: 'attacker-pass-1' }))).fields).toHaveProperty('code');
      await confirmPasswordReset(db, env, { token, code, password: 'brand-new-pass-1' });
      expect((await signInAdmin(db, { email: 'rina@example.com', password: 'brand-new-pass-1' }, meta)).role).toBe('admin');
      expect((await appError(confirmPasswordReset(db, env, { token, code, password: 'again-pass-123' }))).message).toContain('already been used');

      const decoy = await requestPasswordReset(db, env, { type: 'admin', email: 'ghost@example.com' });
      expect(mail.sent).toHaveLength(1); // nothing sent for unknown accounts
      expect(decoy.length).toBeGreaterThan(20);
      expect((await appError(confirmPasswordReset(db, env, { token: decoy, code: '123456', password: 'whatever-pass-1' }))).status).toBe(400);

      const token2 = await requestPasswordReset(db, env, { type: 'admin', email: 'rina@example.com' });
      const good = mail.lastCode();
      for (let i = 0; i < 5; i++) {
        const wrong = String(((Number(good) - 100000 + 1 + i) % 900000) + 100000);
        await appError(confirmPasswordReset(db, env, { token: token2, code: wrong, password: 'locked-pass-12' }));
      }
      expect((await appError(confirmPasswordReset(db, env, { token: token2, code: good, password: 'locked-pass-12' }))).status).toBe(429);
    });
  });
}
