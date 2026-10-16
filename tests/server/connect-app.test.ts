import { afterEach, describe, expect, it, vi } from 'vitest';
import { signEnvelope } from '@/server/connect-app/protocol';
import { handleConnect } from '@/server/connect-app/service';
import { enqueueSms } from '@/server/connectx/sms';
import type { Database } from '@/server/db';
import type { AppEnv } from '@/server/env';
import { providerCases } from '../helpers/providers';

const env = { SESSION_SECRET: 'x'.repeat(48), provider: 'd1' } as AppEnv;
const call = async (db: Database, body?: unknown) => {
  const res = await handleConnect(new Request('https://ems.example/connect', body ? { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } } : {}), db, env);
  return { status: res.status, data: (await res.json()) as Record<string, unknown> };
};

afterEach(() => vi.unstubAllGlobals());

async function shopWithConnectX(db: Database) {
  const admin = await db.from('admins').insertOne({ admin_code: '5001', name: 'A', email: 'a@example.com', phone: '0170', password_hash: 'x' });
  const shop = await db.from('shops').insertOne({ admin_id: admin.id, shop_code: '6001', name: 'SMS Shop' });
  const now = Date.now();
  await db.from('licenses').insert({
    admin_id: admin.id, kind: 'new', title: 'Plan', duration_months: 1, max_shops: 1, modules: { connectx: 100 }, amount: 0, payment_method: 'other',
    status: 'active', starts_at: new Date(now - 60_000).toISOString(), expires_at: new Date(now + 86_400_000).toISOString(),
  });
  await db.from('sms_settings').insert({ shop_id: shop.id, enabled: true });
  return { admin, shop };
}

for (const provider of providerCases()) {
  describe(`connect app: ${provider.name}`, () => {
    it('keeps one identity and stores inbound pairing requests', async () => {
      const db = await provider.make();
      const a = await call(db);
      const b = await call(db);
      expect(a.data.application_id).toMatch(/^EMS/);
      expect(b.data.application_id).toBe(a.data.application_id);
      const req = await call(db, {
        protocol: 'connect-app/1', action: 'CONNECT_REQUEST', application_id: 'CXP-PHONE1', timestamp: new Date().toISOString(), nonce: 'n1',
        payload: { request_token: 'req_inbound_1', connect_endpoint: 'https://phone.example/connect', application_name: 'ConnectX phone', pairing_code: '123-456', requested_permissions: ['sms:send'] },
      });
      expect(req.status).toBeLessThan(300);
      const row = await db.from('connect_requests').select('status,direction,requested_permissions').eq('id', 'req_inbound_1').single();
      expect(row).toMatchObject({ status: 'PENDING_APPROVAL', direction: 'inbound', requested_permissions: ['sms:send'] });
    });

    it('queues SMS, relays them, and applies signed results from the phone', async () => {
      const db = await provider.make();
      const { admin, shop } = await shopWithConnectX(db);
      const ident = await call(db);
      const secret = 'f'.repeat(64);
      await db.from('connect_connections').insert({
        id: 'CXN-TEST-0001', remote_application_id: 'CXP-PHONE1', remote_endpoint: 'https://phone.example/connect', permissions: ['sms:send'],
        shared_secret: secret, status: 'ACTIVE',
      });
      const relayed: unknown[] = [];
      const real = globalThis.fetch;
      vi.stubGlobal('fetch', async (url: string | URL | Request, init?: RequestInit) => {
        if (String(url).startsWith('https://phone.example')) {
          relayed.push(JSON.parse(String(init?.body)));
          return Response.json({ ok: true, status: 'PROCESSING' });
        }
        return real(url, init);
      });
      const r = await enqueueSms(db, { shop, sentBy: admin.id, phone: '01711000000', body: 'Hello', event: 'MANUAL', recipientType: 'manual', idempotencyKey: 'k1' });
      expect('ok' in r && r.ok).toBe(true);
      const requestId = 'requestId' in r ? r.requestId : '';
      expect(requestId).toMatch(/^SMS-1\d{4}$/);
      expect(relayed).toHaveLength(1);
      expect(JSON.stringify(relayed[0])).toContain('"message":"Hello"');
      expect((await db.from('sms_messages').select('status').eq('request_id', requestId).single()).status).toBe('sending');

      const env1 = await signEnvelope({ action: 'SMS_RESULT', applicationId: 'CXP-PHONE1', connectionId: 'CXN-TEST-0001', payload: { request_id: requestId, status: 'SUCCESS', sim_used: 'SIM1' }, secret });
      const res = await call(db, env1);
      expect(res.data).toMatchObject({ ok: true, status: 'SUCCESS' });
      expect(await db.from('sms_messages').select('status,sim_used').eq('request_id', requestId).single()).toEqual({ status: 'sent', sim_used: 'SIM1' });

      const forged = { ...env1, signature: 'bad' };
      expect((await call(db, forged)).status).toBeGreaterThanOrEqual(400);

      const list = await call(db, await signEnvelope({ action: 'APP_SMS', applicationId: 'CXP-PHONE1', connectionId: 'CXN-TEST-0001', payload: { admin_id: admin.id, shop_id: shop.id }, secret }));
      const items = (list.data.items ?? []) as Record<string, unknown>[];
      expect(items[0]).toMatchObject({ message_body: 'Hello', status: 'sent' }); // the phone list uses lowercase statuses (4.x contract)
      expect(items[0]).toHaveProperty('error_message');
      expect(ident.data.application_id).toBeTruthy();
    });
  });
}
