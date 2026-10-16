import 'server-only';
import type { Database } from '@/server/db';
import { AppError } from '@/server/errors';
import {
  connectionId, getConnect, normalizeEndpoint, nowIso, pairingCode, parsePerms, postConnect, PROTOCOL, requestToken, sharedSecret,
} from './protocol';
import {
  applyConnectionStatus, canonSms, dispatchPendingSms, ensureIdentity, loadConnection, notifyRemote, REQUEST_TTL_MS, setEndpointOverride, touchConnection,
} from './service';

/** Owner console → Connect App: identity, pairing requests, connections and the SMS relay. */

export async function connectOverview(db: Database, origin: string) {
  const identity = await ensureIdentity(db, origin);
  await dispatchPendingSms(db).catch(() => undefined);
  const [connections, requests, sms] = await Promise.all([
    db.from('connect_connections').select('id,remote_application_name,remote_endpoint,remote_kind,permissions,status,display_name,connected_at,last_seen_at').order('created_at', 'desc'),
    db.from('connect_requests').select('id,direction,pairing_code,remote_application_name,remote_endpoint,display_name,status,created_at,expires_at').order('created_at', 'desc').limit(30),
    db.from('sms_messages').select('id,request_id,to_phone,status,error,sim_used,created_at,sent_at').order('created_at', 'desc').limit(20),
  ]);
  return { identity, connections, requests, sms: sms.map((r) => ({ ...r, protocolStatus: canonSms(r.status) })) };
}

export async function saveEndpoint(db: Database, value: string) {
  const endpoint = value ? normalizeEndpoint(value, { allowPrivate: true }) : '';
  if (value && !endpoint) throw new AppError('Enter a valid https Connect Endpoint.', 400, { endpoint: 'Must be an https address' });
  await setEndpointOverride(db, endpoint);
}

/** Sends a pairing request to another app; the pairing code must match on both sides. */
export async function requestConnection(db: Database, origin: string, input: { remote_endpoint: string; display_name?: string }) {
  const identity = await ensureIdentity(db, origin);
  const remote = normalizeEndpoint(input.remote_endpoint);
  if (!remote) throw new AppError('Paste the other app’s Connect Endpoint, for example https://example.app/connect', 400, { remote_endpoint: 'Invalid address' });
  if (remote === identity.connect_endpoint) throw new AppError('That is this installation’s own Connect Endpoint.', 400, { remote_endpoint: 'Use the other app’s address' });
  const probe = await getConnect(remote);
  if (!probe.httpOk || probe.data?.protocol !== PROTOCOL) throw new AppError(String(probe.data?.error || 'That address did not answer as a Connect App.'), 502);
  const token = requestToken();
  const code = pairingCode();
  const display = (input.display_name || identity.application_name || 'EMS').slice(0, 80);
  const permissions = ['sms:send'];
  await db.from('connect_requests').insert({
    id: token, direction: 'outbound', pairing_code: code, remote_application_id: String(probe.data.application_id || '') || null,
    remote_application_name: String(probe.data.application_name || 'Remote app'), remote_endpoint: remote, display_name: display,
    requested_permissions: permissions, status: 'PENDING_APPROVAL', expires_at: new Date(Date.now() + REQUEST_TTL_MS).toISOString(),
  });
  const sent = await postConnect(remote, {
    protocol: PROTOCOL, action: 'CONNECT_REQUEST', application_id: identity.application_id, connection_id: '', timestamp: nowIso(), nonce: requestToken().slice(4, 20),
    payload: {
      application_name: identity.application_name, kind: 'product', connect_endpoint: identity.connect_endpoint, display_name: display,
      requested_permissions: permissions, pairing_code: code, request_token: token,
    },
  });
  if (!sent.httpOk || sent.data?.ok === false) {
    await db.from('connect_requests').eq('id', token).update({ status: 'FAILED' });
    throw new AppError(String(sent.data?.error || 'The other app did not accept the connection request.'), 502);
  }
  return code;
}

export async function cancelRequest(db: Database, id: string) {
  await db.from('connect_requests').eq('id', id).eq('status', 'PENDING_APPROVAL').update({ status: 'CANCELLED' });
}

/** Approves an inbound request: completes the handshake and stores the shared secret. */
export async function approveRequest(db: Database, origin: string, id: string) {
  const identity = await ensureIdentity(db, origin);
  const pending = await db.from('connect_requests').select('*').eq('id', id).maybeSingle();
  if (!pending || pending.direction !== 'inbound') throw new AppError('Connection request not found.', 404);
  if (pending.status !== 'PENDING_APPROVAL') throw new AppError('This request is not waiting for approval.', 409);
  if (Date.parse(pending.expires_at) < Date.now()) throw new AppError('This request expired. Ask the other app to send a new one.', 410);
  const connId = connectionId();
  const secret = sharedSecret();
  const granted = parsePerms(pending.requested_permissions).length ? parsePerms(pending.requested_permissions) : ['sms:send'];
  const call = await postConnect(String(pending.remote_endpoint), {
    protocol: PROTOCOL, action: 'HANDSHAKE', application_id: identity.application_id, connection_id: '', timestamp: nowIso(), nonce: requestToken().slice(4, 20),
    payload: {
      request_token: pending.id, pairing_code: pending.pairing_code, connection_id: connId, permissions: granted, shared_secret: secret,
      application_name: 'EMS', connect_endpoint: identity.connect_endpoint, kind: 'product',
    },
  });
  if (!call.httpOk || call.data?.ok === false) throw new AppError(String(call.data?.error || 'The other app did not confirm the handshake.'), 502);
  await db.from('connect_connections').insert({
    id: connId, remote_application_id: String(call.data.application_id || pending.remote_application_id || ''),
    remote_application_name: String(call.data.application_name || pending.remote_application_name || 'Remote app'),
    remote_endpoint: normalizeEndpoint(call.data.connect_endpoint) || String(pending.remote_endpoint), remote_kind: 'gateway', permissions: granted,
    shared_secret: secret, status: 'ACTIVE', display_name: String(pending.display_name || call.data.application_name || 'Connected app'), last_seen_at: nowIso(),
  });
  await db.from('connect_requests').eq('id', id).update({ status: 'CONSUMED', connection_id: connId });
}

export async function setConnectionStatus(db: Database, id: string, status: 'ACTIVE' | 'PAUSED' | 'DISCONNECTED' | 'DELETED') {
  if (status === 'DISCONNECTED') {
    const conn = await loadConnection(db, id);
    if (!conn) throw new AppError('Connection not found.', 404);
    if (conn.status === 'ACTIVE') await notifyRemote(db, conn, 'DISCONNECT', { reason: 'Disconnected by the platform owner' }).catch(() => undefined);
    await db.from('connect_connections').eq('id', id).update({ status: 'DISCONNECTED', disconnected_at: nowIso() });
    return;
  }
  const res = await applyConnectionStatus(db, id, status);
  if (!res.ok) throw new AppError(String(((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'Could not change the connection.'), res.status);
}

export async function pingConnection(db: Database, id: string) {
  const conn = await loadConnection(db, id);
  if (!conn || conn.status !== 'ACTIVE') throw new AppError('This connection is not active.', 409);
  const res = await notifyRemote(db, conn, 'PING', {});
  if (!res.httpOk || res.data?.ok === false) throw new AppError(String(res.data?.error || 'The other app did not answer.'), 502);
  await touchConnection(db, String(conn.id));
}

export const dispatchQueuedSms = (db: Database) => dispatchPendingSms(db);
