/**
 * Connect App protocol v1 (unchanged wire format from EMS 4.x).
 *
 * A product-agnostic envelope so any application (EMS, ConnectX, an Android
 * SMS gateway, …) can connect to another without sharing a database.
 * Transport: HTTPS POST to the remote Connect Endpoint (…/connect). After
 * approval every call is HMAC-SHA256 signed with the connection's shared
 * secret, which never appears in website responses.
 *
 * Canonical string (UTF-8, LF):
 *   connect-app/1 \n ACTION \n application_id \n connection_id \n timestamp \n nonce \n sha256(stableJson(payload))
 */

export const PROTOCOL = 'connect-app/1';
export const SKEW_MS = 10 * 60 * 1000;
const enc = new TextEncoder();
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

export function randomToken(prefix: string, n = 8): string {
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  let s = '';
  for (let i = 0; i < n; i++) s += ALPHABET[bytes[i]! % ALPHABET.length];
  return `${prefix}-${s}`;
}
export const applicationId = (prefix: string) => randomToken(prefix, 8);
export const connectionId = () => randomToken('CXN', 12);

export function pairingCode(): string {
  const d = [...crypto.getRandomValues(new Uint8Array(6))].map((b) => String(b % 10)).join('');
  return `${d.slice(0, 3)}-${d.slice(3)}`;
}
export const requestToken = () => `req_${hex(crypto.getRandomValues(new Uint8Array(24)))}`;
export const sharedSecret = () => hex(crypto.getRandomValues(new Uint8Array(32)));
export const nonce = () => requestToken().slice(4, 28);
export const nowIso = () => new Date().toISOString();

export function parsePerms(value: unknown): string[] {
  if (Array.isArray(value)) return [...new Set(value.map((x) => String(x).trim()).filter(Boolean))];
  if (value == null || value === '') return [];
  if (typeof value === 'object') return parsePerms(Object.values(value as Record<string, unknown>));
  try {
    return parsePerms(JSON.parse(String(value)));
  } catch {
    return [];
  }
}
export function stableStringify(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v) ?? 'null').join(',')}]`;
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    const keys = Object.keys(o).filter((k) => o[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(o[k]) ?? 'null'}`).join(',')}}`;
  }
  return 'null';
}

export async function sha256Hex(value: unknown): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(String(value)))));
}

export async function hmacHex(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(String(secret)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(String(data)))));
}

interface CanonicalParts { action: string; applicationId?: string; connectionId?: string; timestamp?: string; nonce?: string; payloadHash?: string }
export function canonicalString(p: CanonicalParts): string {
  return [PROTOCOL, p.action, p.applicationId || '', p.connectionId || '', p.timestamp || '', p.nonce || '', p.payloadHash || ''].join('\n');
}

export interface Envelope {
  protocol: string;
  action: string;
  application_id: string;
  connection_id: string;
  timestamp: string;
  nonce: string;
  payload: Record<string, unknown>;
  signature?: string;
}

export async function signEnvelope(o: { action: string; applicationId: string; connectionId?: string; payload?: Record<string, unknown>; secret: string }): Promise<Envelope> {
  const timestamp = nowIso();
  const n = nonce();
  const payload = o.payload ?? {};
  const payloadHash = await sha256Hex(stableStringify(payload) ?? '{}');
  const signature = await hmacHex(canonicalString({ action: o.action, applicationId: o.applicationId, connectionId: o.connectionId ?? '', timestamp, nonce: n, payloadHash }), o.secret);
  return { protocol: PROTOCOL, action: o.action, application_id: o.applicationId, connection_id: o.connectionId || '', timestamp, nonce: n, payload, signature };
}

export async function verifySignature(envelope: Partial<Envelope> | null | undefined, secret: string | null | undefined): Promise<boolean> {
  if (!envelope || !secret) return false;
  const payloadHash = await sha256Hex(stableStringify(envelope.payload || {}) ?? '{}');
  const expected = await hmacHex(canonicalString({
    action: String(envelope.action ?? ''), applicationId: envelope.application_id, connectionId: envelope.connection_id || '',
    timestamp: envelope.timestamp, nonce: envelope.nonce, payloadHash,
  }), secret);
  const got = String(envelope.signature || '');
  if (got.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}

export function freshTimestamp(iso: unknown): boolean {
  const t = Date.parse(String(iso || ''));
  return Number.isFinite(t) && Math.abs(Date.now() - t) <= SKEW_MS;
}

/** Hostnames a Connect endpoint may never point at (SSRF guard for Node.js deployments). */
function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.)/.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(h)) return true;
  if (h === '::1' || h === '::' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80') || h.startsWith('::ffff:')) return true;
  return false;
}

export function normalizeEndpoint(input: unknown, opts: { allowPrivate?: boolean } = {}): string {
  const raw = String(input || '').trim();
  if (!raw) return '';
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return '';
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
  if (!url.hostname || url.username || url.password) return '';
  if (!opts.allowPrivate && isPrivateHost(url.hostname)) return '';
  const path = url.pathname.replace(/\/+$/, '');
  const base = `${url.protocol}//${url.host}`;
  if (!path || path === '/') return `${base}/connect`;
  if (path === '/connect' || path.endsWith('/connect')) return `${base}${path}`;
  return `${base}${path}/connect`;
}

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'content-type, accept',
    },
  });
}
export const failResponse = (error: string, status = 400, code = 'bad_request') => jsonResponse({ ok: false, error, code }, status);

export interface ConnectResult { httpOk: boolean; status: number; data: Record<string, unknown> }

export async function postConnect(endpoint: string, body: unknown, timeoutMs = 8000): Promise<ConnectResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(endpoint, {
      method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal, redirect: 'manual',
    });
    const text = await res.text();
    let data: Record<string, unknown> = {};
    try {
      data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      data = { error: String(text || '').slice(0, 240) };
    }
    return { httpOk: res.ok, status: res.status, data };
  } catch (error) {
    const aborted = (error as Error)?.name === 'AbortError';
    return { httpOk: false, status: 0, data: { ok: false, error: aborted ? 'Connect endpoint timed out.' : (error as Error)?.message || 'Connect endpoint unreachable.' } };
  } finally {
    clearTimeout(timer);
  }
}

export async function getConnect(endpoint: string, timeoutMs = 8000): Promise<ConnectResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(endpoint, { method: 'GET', headers: { accept: 'application/json' }, signal: ctrl.signal, redirect: 'manual' });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { httpOk: res.ok, status: res.status, data };
  } catch (error) {
    return { httpOk: false, status: 0, data: { error: (error as Error)?.message || 'Unreachable' } };
  } finally {
    clearTimeout(timer);
  }
}
