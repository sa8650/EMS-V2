import 'server-only';
import { instantRange, today } from '@/lib/dates';
import { verifyPassword } from '@/server/auth/crypto';
import { isThrottled, recordAttempt } from '@/server/auth/throttle';
import type { Database, Row } from '@/server/db';
import type { AppEnv } from '@/server/env';
import { SETTING_SCHEMAS } from '@/server/settings';
import {
  applicationId, failResponse, freshTimestamp, jsonResponse, normalizeEndpoint, nowIso, parsePerms, postConnect,
  PROTOCOL, signEnvelope, verifySignature, type ConnectResult, type Envelope,
} from './protocol';

/**
 * Connect App: pairs EMS with other applications (notably the ConnectX
 * Android SMS gateway) and relays SMS jobs. The wire protocol (envelopes,
 * actions, uppercase statuses, CXN-/req_ ids) is unchanged from EMS 4.x so
 * paired apps keep working; database rows use the EMS 5 schema.
 */

export const REQUEST_TTL_MS = 30 * 60 * 1000;
const MAX_PENDING_INBOUND = 50;

const SMS_CANON: Record<string, string> = {
  queued: 'PENDING', sending: 'PROCESSING', sent: 'SUCCESS', failed: 'FAILED',
  PENDING: 'PENDING', PROCESSING: 'PROCESSING', SUCCESS: 'SUCCESS', FAILED: 'FAILED',
};
export const canonSms = (status: unknown): string => SMS_CANON[String(status)] || String(status || '') || 'PENDING';

export interface Identity {
  ready: boolean;
  error?: string;
  application_id: string;
  application_name: string;
  kind: string;
  endpoint_override: string;
  connect_endpoint: string;
}

function endpointFrom(origin: string | null, override: unknown): string {
  const saved = normalizeEndpoint(override, { allowPrivate: true });
  if (saved) return saved;
  return origin ? `${origin}/connect` : '';
}

/** Loads (or creates, once) this installation's Connect identity. */
export async function ensureIdentity(db: Database, origin: string | null): Promise<Identity> {
  const read = async () => {
    const row = await db.from('settings').select('value').eq('key', 'connect_identity').maybeSingle();
    return row ? SETTING_SCHEMAS.connect_identity.parse(row.value) : null;
  };
  let ident = await read();
  if (!ident?.application_id) {
    const created = { application_id: applicationId('EMS'), application_name: 'EMS', endpoint_override: ident?.endpoint_override ?? '' };
    // The settings primary key makes creation atomic: a concurrent request reads the winner.
    await db.from('settings').insert({ key: 'connect_identity', value: created }).catch(() => undefined);
    ident = (await read()) ?? created;
  }
  return {
    ready: true,
    application_id: ident.application_id,
    application_name: ident.application_name || 'EMS',
    kind: 'product',
    endpoint_override: ident.endpoint_override,
    connect_endpoint: endpointFrom(origin, ident.endpoint_override),
  };
}

export async function setEndpointOverride(db: Database, endpoint: string) {
  const ident = await ensureIdentity(db, null);
  await db.from('settings').eq('key', 'connect_identity').update({ value: { application_id: ident.application_id, application_name: ident.application_name, endpoint_override: endpoint } });
}

export function publicIdentity(ident: Identity) {
  return {
    protocol: PROTOCOL, application_id: ident.application_id, application_name: ident.application_name || 'EMS',
    kind: ident.kind || 'product', connect_endpoint: ident.connect_endpoint, capabilities: ['sms:send', 'sms:status'],
  };
}

export async function touchConnection(db: Database, id: string) {
  await db.from('connect_connections').eq('id', id).update({ last_seen_at: nowIso() }).catch(() => undefined);
}

/** Human-readable SMS request ids (SMS-10001…), from an atomic counter. */
export async function nextSmsRequestId(db: Database): Promise<string> {
  const n = Number(await db.rpc('next_counter', { p_scope: 'platform', p_name: 'connect_sms' }));
  return `SMS-${String(10000 + n).padStart(5, '0')}`;
}

/** Protocol statuses (uppercase) → stored statuses. */
const STORED_STATUS: Record<string, string> = { PENDING: 'queued', PROCESSING: 'sending', SUCCESS: 'sent', FAILED: 'failed', CANCELLED: 'cancelled' };
export const storedSmsStatus = (status: unknown): string => STORED_STATUS[String(status)] ?? String(status || 'queued').toLowerCase();

export async function patchSms(db: Database, id: string, patch: Row): Promise<Row | null> {
  const p = patch.status === undefined ? patch : { ...patch, status: storedSmsStatus(patch.status) };
  const [row] = await db.from('sms_messages').eq('id', id).update(p);
  return row ?? null;
}

export async function insertSmsRow(db: Database, row: Row): Promise<Row> {
  return db.from('sms_messages').insertOne({ ...row, status: storedSmsStatus(row.status) });
}

async function activeSmsConnection(db: Database): Promise<Row | null> {
  const rows = await db.from('connect_connections').select('*').eq('status', 'ACTIVE').order('connected_at', 'desc').catch(() => [] as Row[]);
  return rows.find((r) => parsePerms(r.permissions).includes('sms:send')) ?? null;
}

export async function dispatchSmsRecord(db: Database, record: Row | null) {
  if (!record?.id) return { skipped: 'no_record' };
  const status = canonSms(record.status);
  if (status === 'SUCCESS' || status === 'FAILED') return { skipped: 'final', status };
  const conn = await activeSmsConnection(db);
  const id = String(record.id);
  if (!conn) {
    await patchSms(db, id, { status: 'PENDING', error: 'Waiting for an active Connect App connection with sms:send.' });
    return { ok: false, status: 'PENDING', error: 'not_connected' };
  }
  let requestId = record.request_id ? String(record.request_id) : '';
  if (!requestId) {
    requestId = await nextSmsRequestId(db);
    await patchSms(db, id, { request_id: requestId, status: 'PENDING' });
  }
  const envelope = await signEnvelope({
    action: 'SEND_SMS',
    applicationId: (await ensureIdentity(db, null)).application_id,
    connectionId: String(conn.id),
    secret: String(conn.shared_secret),
    payload: {
      request_id: requestId, recipient: record.to_phone, message: record.body, shop_id: record.shop_id || '',
      meta: { recipient_name: record.recipient_name || '', message_type: record.message_type || '', shop_id: record.shop_id || '' },
    },
  });
  const res = await postConnect(String(conn.remote_endpoint), envelope);
  if (!res.httpOk || res.data?.ok === false) {
    const reason = String(res.data?.error || 'ConnectX did not accept the SMS request.');
    await patchSms(db, id, { status: 'PENDING', connection_id: conn.id, request_id: requestId, error: reason });
    return { ok: false, status: 'PENDING', request_id: requestId, error: reason };
  }
  await touchConnection(db, String(conn.id));
  const remoteStatus = canonSms(res.data?.status || 'PENDING');
  await patchSms(db, id, { status: remoteStatus, connection_id: conn.id, request_id: requestId, error: remoteStatus === 'FAILED' ? String(res.data?.reason || 'Rejected') : null });
  return { ok: true, status: remoteStatus, request_id: requestId, duplicate: !!res.data?.duplicate };
}

export async function dispatchPendingSms(db: Database) {
  const rows = await db.from('sms_messages').select('*').in('status', ['queued', 'PENDING']).order('created_at', 'asc').limit(25).catch(() => [] as Row[]);
  const out = [];
  for (const row of rows) out.push(await dispatchSmsRecord(db, row));
  return out;
}

export async function notifyRemote(db: Database, conn: Row, action: string, payload: Record<string, unknown>): Promise<ConnectResult> {
  if (!conn?.remote_endpoint || !conn.shared_secret) return { httpOk: false, status: 0, data: { ok: false } };
  if (conn.status === 'DISCONNECTED' && !['DISCONNECT', 'SET_STATUS'].includes(action)) return { httpOk: false, status: 0, data: { ok: false } };
  const ident = await ensureIdentity(db, null);
  const envelope = await signEnvelope({ action, applicationId: ident.application_id, connectionId: String(conn.id), secret: String(conn.shared_secret), payload });
  return postConnect(String(conn.remote_endpoint), envelope);
}

export async function loadConnection(db: Database, id: string): Promise<Row | null> {
  return db.from('connect_connections').select('*').eq('id', id).maybeSingle().catch(() => null);
}

async function applySmsResult(db: Database, connection: Row, payload: Record<string, unknown>): Promise<Response> {
  const requestId = String(payload?.request_id || '').trim();
  const status = canonSms(payload?.status);
  if (!requestId) return failResponse('request_id is required.', 400, 'request_id');
  if (!['SUCCESS', 'FAILED', 'PROCESSING', 'PENDING'].includes(status)) return failResponse('Invalid SMS status.', 400, 'status');
  const rows = await db.from('sms_messages').select('*').eq('request_id', requestId).catch(() => [] as Row[]);
  const row = rows.find((r) => !r.connection_id || r.connection_id === connection.id) ?? rows[0];
  if (!row) return failResponse('Unknown Request ID.', 404, 'unknown_request');
  const current = canonSms(row.status);
  if ((current === 'SUCCESS' || current === 'FAILED') && current !== status) return jsonResponse({ ok: true, request_id: requestId, status: current, duplicate: true });
  await patchSms(db, String(row.id), {
    status, connection_id: connection.id, sim_used: payload?.sim_used || row.sim_used || null,
    error: status === 'FAILED' ? String(payload?.reason || 'FAILED').slice(0, 400) : null,
    result_at: payload?.timestamp || nowIso(), sent_at: status === 'SUCCESS' ? payload?.timestamp || nowIso() : row.sent_at || null,
  });
  await touchConnection(db, String(connection.id));
  return jsonResponse({ ok: true, request_id: requestId, status });
}

async function handleHandshake(db: Database, origin: string, envelope: Envelope): Promise<Response> {
  const p = envelope.payload || {};
  const token = String(p.request_token || '').trim();
  const code = String(p.pairing_code || '').trim();
  const connId = String(p.connection_id || '').trim();
  if (!token || !code || !connId || !p.shared_secret) return failResponse('Handshake is incomplete.', 400, 'handshake');
  const pending = await db.from('connect_requests').select('*').eq('id', token).maybeSingle().catch(() => null);
  if (!pending || pending.direction !== 'outbound') return failResponse('Unknown connection request.', 404, 'unknown_request');
  if (pending.pairing_code !== code) return failResponse('Pairing code does not match.', 403, 'pairing_code');
  if (pending.status === 'CONSUMED' && pending.connection_id === connId) {
    return jsonResponse({ ok: true, status: 'ACTIVE', connection_id: connId, ...publicIdentity(await ensureIdentity(db, origin)) });
  }
  if (pending.status !== 'PENDING_APPROVAL') return failResponse('This connection request is no longer waiting.', 409, 'not_pending');
  if (pending.expires_at && Date.parse(String(pending.expires_at)) < Date.now()) return failResponse('Connection request expired. Send a new one.', 410, 'expired');
  const remoteEndpoint = normalizeEndpoint(p.connect_endpoint);
  if (!remoteEndpoint) return failResponse('Remote Connect Endpoint is invalid.', 400, 'endpoint');
  const name = String(p.application_name || 'Remote app').slice(0, 80);
  await db.from('connect_connections').insert({
    id: connId, remote_application_id: envelope.application_id, remote_application_name: name, remote_endpoint: remoteEndpoint,
    remote_kind: String(p.kind || 'gateway').slice(0, 40), permissions: parsePerms(p.permissions || pending.requested_permissions),
    shared_secret: String(p.shared_secret), status: 'ACTIVE', display_name: String(pending.display_name || p.application_name || 'Connected app'),
    connected_at: nowIso(), last_seen_at: nowIso(), created_at: nowIso(),
  });
  await db.from('connect_requests').eq('id', token).update({
    status: 'CONSUMED', connection_id: connId, remote_application_id: envelope.application_id, remote_application_name: name, remote_endpoint: remoteEndpoint,
  });
  const ident = await ensureIdentity(db, origin);
  return jsonResponse({ ok: true, status: 'ACTIVE', connection_id: connId, application_id: ident.application_id, application_name: ident.application_name, connect_endpoint: ident.connect_endpoint });
}

async function signedConnection(db: Database, envelope: Envelope, allowPaused: boolean): Promise<{ conn?: Row; error?: Response }> {
  if (!envelope?.connection_id || !envelope?.application_id) return { error: failResponse('connection_id and application_id are required.', 401, 'unauthorized') };
  if (!freshTimestamp(envelope.timestamp)) return { error: failResponse('Request timestamp is outside the allowed window.', 401, 'stale') };
  const conn = await loadConnection(db, envelope.connection_id);
  if (!conn || (conn.status !== 'ACTIVE' && !(allowPaused && conn.status === 'PAUSED'))) {
    return { error: failResponse(conn?.status === 'PAUSED' ? 'Connection is paused.' : 'Connection is not active.', 403, 'not_connected') };
  }
  if (conn.remote_application_id && conn.remote_application_id !== envelope.application_id) return { error: failResponse('Application ID does not match this connection.', 403, 'application_id') };
  if (!(await verifySignature(envelope, String(conn.shared_secret)))) return { error: failResponse('Signature check failed.', 401, 'bad_signature') };
  return { conn };
}

/* ---- actions used by the ConnectX phone app over a signed connection ---- */

function publicAdmin(row: Row | null) {
  if (!row) return null;
  return {
    id: row.id, admin_code: row.admin_code || null, name: row.name || '', email: row.email || '', phone: row.phone || '',
    address: row.address || '', active: row.active !== false && row.active !== 0, created_at: row.created_at || null,
  };
}

async function shopsForAdmin(db: Database, adminId: string) {
  const rows = await db.from('shops').select('id,name,address,phone,shop_code,category,active').eq('admin_id', adminId).eq('active', true).order('name', 'asc');
  return rows.map((s) => ({
    id: s.id, name: s.name, address: s.address || '', phone: s.phone || '', shop_code: s.shop_code || '', category: s.category || '', status: 'active', connected: false,
  }));
}

async function verifyAdminForPhone(db: Database, payload: Record<string, unknown>): Promise<Response> {
  const login = String(payload?.email || payload?.user_id || payload?.userId || '').trim();
  const password = String(payload?.password || '');
  if (!login || !password) return failResponse('Email or Administrator ID, and a password, are required.', 400, 'credentials');
  const subject = `connect-admin:${login.toLowerCase()}`;
  if (await isThrottled(db, 'login', subject)) return failResponse('Too many failed sign-in attempts. Try again in 15 minutes.', 429, 'throttled');
  const admin = login.includes('@')
    ? await db.from('admins').select('*').eq('email', login.toLowerCase()).maybeSingle().catch(() => null)
    : await db.from('admins').select('*').eq('admin_code', login).maybeSingle().catch(() => null);
  if (!admin || !(await verifyPassword(password, String(admin.password_hash)))) {
    await recordAttempt(db, 'login', subject);
    return failResponse('Wrong email, Administrator ID, or password.', 401, 'unauthorized');
  }
  if (!admin.active) return failResponse('Your administrator account is deactivated. Contact EMS support.', 403, 'inactive');
  return jsonResponse({ ok: true, administrator: publicAdmin(admin), shops: await shopsForAdmin(db, String(admin.id)) });
}

async function appShops(db: Database, payload: Record<string, unknown>): Promise<Response> {
  const adminId = String(payload?.admin_id || '').trim();
  if (!adminId) return failResponse('admin_id is required.', 400, 'admin');
  const admin = await db.from('admins').select('id,admin_code,name,email,phone,address,active,created_at').eq('id', adminId).maybeSingle().catch(() => null);
  if (!admin || !admin.active) return failResponse('Administrator not found.', 404, 'admin');
  return jsonResponse({ ok: true, administrator: publicAdmin(admin), shops: await shopsForAdmin(db, String(admin.id)) });
}

async function shopOwned(db: Database, adminId: string, shopId: string) {
  if (!adminId || !shopId) return null;
  const row = await db.from('shops').select('id,active').eq('id', shopId).eq('admin_id', adminId).maybeSingle();
  return row?.active ? row : null;
}

function asList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  try {
    const p: unknown = JSON.parse(String(v || '[]'));
    return Array.isArray(p) ? p.map(String) : [];
  } catch {
    return [];
  }
}

function emailPublic(row: Row | null | undefined, detail: boolean) {
  if (!row) return null;
  return {
    id: row.id, subject: row.subject || '', from_email: row.from_email || '', to_emails: asList(row.to_emails), cc_emails: asList(row.cc_emails),
    bcc_emails: detail ? asList(row.bcc_emails) : undefined, recipient_type: row.recipient_type || '', status: row.status || 'queued',
    error_message: row.error || null, created_at: row.created_at, sent_at: row.sent_at || null, // wire field name kept for paired apps
    ...(detail ? { custom_body: row.custom_body || '', body_html: row.body_html || '' } : {}),
  };
}

const EMAIL_LIST_COLS = 'id,subject,from_email,to_emails,cc_emails,recipient_type,status,error,created_at,sent_at';

async function appEmails(db: Database, payload: Record<string, unknown>): Promise<Response> {
  const adminId = String(payload?.admin_id || '').trim();
  const shopId = String(payload?.shop_id || '').trim();
  if (!(await shopOwned(db, adminId, shopId))) return failResponse('This shop is not available for that administrator.', 403, 'shop');
  const op = String(payload?.op || 'stats');
  if (op === 'detail') {
    const row = await db.from('email_messages').select('*').eq('id', String(payload?.email_id || '').trim()).eq('shop_id', shopId).maybeSingle().catch(() => null);
    return row ? jsonResponse({ ok: true, email: emailPublic(row, true) }) : failResponse('Email not found.', 404, 'email');
  }
  if (op === 'page') {
    const page = Math.max(0, Number(payload.page) || 0);
    const limit = 30;
    const rows = await db.from('email_messages').select(EMAIL_LIST_COLS).eq('shop_id', shopId).is('hidden_at', null)
      .order('created_at', 'desc').limit(limit + 1).offset(page * limit).catch(() => [] as Row[]);
    return jsonResponse({ ok: true, items: rows.slice(0, limit).map((r) => emailPublic(r, false)), page, hasMore: rows.length > limit, snapshot: nowIso() });
  }
  const since = String(payload?.since || instantRange(today(), today()).start);
  const rows = await db.from('email_messages').select('id,status,sent_at,created_at').eq('shop_id', shopId).gte('created_at', since).limit(500).catch(() => [] as Row[]);
  const latest = await db.from('email_messages').select(EMAIL_LIST_COLS).eq('shop_id', shopId).is('hidden_at', null).order('created_at', 'desc').limit(1).catch(() => [] as Row[]);
  return jsonResponse({
    ok: true,
    sent: rows.filter((r) => r.status === 'sent').length,
    failed: rows.filter((r) => r.status === 'failed').length,
    pending: rows.filter((r) => r.status === 'queued' || r.status === 'sending').length,
    latest: emailPublic(latest[0], false),
  });
}

function phoneSmsStatus(status: unknown): string {
  const s = String(status || '').toUpperCase();
  if (s === 'SUCCESS' || s === 'SENT') return 'sent';
  if (s === 'FAILED') return 'failed';
  if (s === 'PROCESSING' || s === 'SENDING') return 'sending';
  return 'queued';
}

async function appSms(db: Database, payload: Record<string, unknown>): Promise<Response> {
  const adminId = String(payload?.admin_id || '').trim();
  const shopId = String(payload?.shop_id || '').trim();
  if (!(await shopOwned(db, adminId, shopId))) return failResponse('This shop is not available for that administrator.', 403, 'shop');
  const since = String(payload?.since || '1970-01-01T00:00:00.000Z');
  const rows = await db.from('sms_messages')
    .select('id,request_id,to_phone,recipient_name,message_type,body,status,error,created_at,sent_at,result_at,invoice_id')
    .eq('shop_id', shopId).gte('created_at', since).order('created_at', 'desc').limit(500).catch(() => [] as Row[]);
  return jsonResponse({
    ok: true,
    items: rows.map((row) => ({
      id: row.id, request_id: row.request_id || '', to_phone: row.to_phone || '', recipient_name: row.recipient_name || 'Recipient',
      message_type: row.message_type || 'SMS', event_type: row.message_type || 'SMS', status: phoneSmsStatus(row.status), error_message: row.error || '',
      message_body: row.body || '', created_at: row.created_at, sent_at: row.sent_at || row.result_at || '', invoice_id: row.invoice_id || null,
    })),
  });
}

export async function applyConnectionStatus(db: Database, id: string, status: unknown, notify = true): Promise<Response> {
  const conn = await loadConnection(db, id);
  if (!conn) return failResponse('Connection not found.', 404, 'not_found');
  const next = String(status || '').toUpperCase();
  if (!['ACTIVE', 'PAUSED', 'DISCONNECTED', 'DELETED'].includes(next)) return failResponse('Choose active, pause, disconnect, or delete.', 400, 'status');
  if (notify) await notifyRemote(db, conn, 'SET_STATUS', { status: next }).catch(() => undefined);
  if (next === 'DELETED') {
    await db.from('connect_connections').eq('id', id).delete();
    return jsonResponse({ ok: true, status: 'DELETED' });
  }
  const patch: Row = { status: next };
  if (next === 'ACTIVE') patch.disconnected_at = null;
  if (next === 'DISCONNECTED') patch.disconnected_at = nowIso();
  await db.from('connect_connections').eq('id', id).update(patch);
  return jsonResponse({ ok: true, status: next });
}

async function applyRemoteStatus(db: Database, envelope: Envelope): Promise<Response> {
  const conn = envelope.connection_id ? await loadConnection(db, envelope.connection_id) : null;
  if (!conn) return failResponse('Unknown connection.', 403, 'not_connected');
  if (conn.remote_application_id && conn.remote_application_id !== envelope.application_id) return failResponse('Application ID does not match this connection.', 403, 'application_id');
  if (!(await verifySignature(envelope, String(conn.shared_secret)))) return failResponse('Signature check failed.', 401, 'bad_signature');
  return applyConnectionStatus(db, String(conn.id), envelope.payload?.status, false);
}

export async function connectGatewayStatus(db: Database) {
  const rows = await db.from('connect_connections').select('id,permissions,last_seen_at').eq('status', 'ACTIVE').catch(() => [] as Row[]);
  const sms = rows.filter((r) => parsePerms(r.permissions).includes('sms:send'));
  const lastSeen = sms.reduce<string | null>((a, r) => (r.last_seen_at && (!a || String(r.last_seen_at) > a) ? String(r.last_seen_at) : a), null);
  const online = sms.some((r) => r.last_seen_at && Date.now() - new Date(String(r.last_seen_at)).getTime() < 15 * 60 * 1000);
  return { configured: sms.length > 0, online, lastSeen, lockedStoreIds: [] as string[], hasGlobal: sms.length > 0 };
}

export async function cancelRemoteSms(db: Database, requestId: unknown) {
  if (!requestId) return;
  const conn = await activeSmsConnection(db);
  if (conn) await notifyRemote(db, conn, 'CANCEL_SMS', { request_id: requestId }).catch(() => undefined);
}

/** Public endpoint: GET identity, POST protocol envelopes (served at /connect). */
export async function handleConnect(req: Request, db: Database, _env: AppEnv): Promise<Response> {
  const method = req.method.toUpperCase();
  if (method === 'OPTIONS') return jsonResponse({ ok: true });
  const origin = new URL(req.url).origin;
  const ident = await ensureIdentity(db, origin);
  if (method === 'GET') return jsonResponse({ ok: true, ...publicIdentity(ident) });
  if (method !== 'POST') return failResponse('Use POST.', 405, 'method');
  let envelope: Envelope;
  try {
    envelope = (await req.json()) as Envelope;
  } catch {
    envelope = {} as Envelope;
  }
  if (envelope.protocol && envelope.protocol !== PROTOCOL) return failResponse('Unsupported Connect protocol.', 400, 'protocol');
  const action = String(envelope.action || '').toUpperCase();

  if (action === 'CONNECT_REQUEST') {
    const p = envelope.payload || {};
    const token = String(p.request_token || '').trim();
    const endpoint = normalizeEndpoint(p.connect_endpoint);
    if (!envelope.application_id || !token || !endpoint) return failResponse('Connection request is incomplete.', 400, 'request');
    const existing = await db.from('connect_requests').select('id').eq('id', token).maybeSingle().catch(() => null);
    if (!existing) {
      const pending = await db.from('connect_requests').select('id').eq('direction', 'inbound').eq('status', 'PENDING_APPROVAL').limit(MAX_PENDING_INBOUND).catch(() => [] as Row[]);
      if (pending.length >= MAX_PENDING_INBOUND) return failResponse('Too many pending connection requests. Ask the EMS owner to review them first.', 429, 'busy');
      await db.from('connect_requests').insert({
        id: token, direction: 'inbound', pairing_code: String(p.pairing_code || ''), remote_application_id: envelope.application_id,
        remote_application_name: String(p.application_name || 'Remote app').slice(0, 80), remote_endpoint: endpoint,
        display_name: String(p.display_name || p.application_name || 'Remote app').slice(0, 80), requested_permissions: parsePerms(p.requested_permissions),
        status: 'PENDING_APPROVAL', created_at: nowIso(), expires_at: new Date(Date.now() + REQUEST_TTL_MS).toISOString(),
      });
    }
    return jsonResponse({ ok: true, status: 'PENDING_APPROVAL', request_token: token, pairing_code: p.pairing_code || null });
  }
  if (action === 'HANDSHAKE') return handleHandshake(db, origin, envelope);
  if (action === 'SET_STATUS') return applyRemoteStatus(db, envelope);

  const allowPaused = ['PING', 'SMS_RESULT', 'VERIFY_ADMIN', 'APP_SHOPS', 'APP_EMAILS', 'APP_SMS', 'DISCONNECT'].includes(action);
  const signed = await signedConnection(db, envelope, allowPaused);
  if (signed.error) return signed.error;
  const conn = signed.conn!;
  const payload = envelope.payload || {};
  switch (action) {
    case 'PING':
      await touchConnection(db, String(conn.id));
      return jsonResponse({ ok: true, status: 'ACTIVE', application_id: ident.application_id, application_name: ident.application_name, connect_endpoint: ident.connect_endpoint });
    case 'SMS_RESULT': return applySmsResult(db, conn, payload);
    case 'VERIFY_ADMIN': return verifyAdminForPhone(db, payload);
    case 'APP_SHOPS': return appShops(db, payload);
    case 'APP_EMAILS': return appEmails(db, payload);
    case 'APP_SMS': return appSms(db, payload);
    case 'DISCONNECT':
      await db.from('connect_connections').eq('id', String(conn.id)).update({ status: 'DISCONNECTED', disconnected_at: nowIso() });
      return jsonResponse({ ok: true, status: 'DISCONNECTED', connection_id: conn.id });
    default:
      return failResponse('Unknown Connect action.', 400, 'action');
  }
}
