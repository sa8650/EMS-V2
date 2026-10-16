/**
 * Token + password primitives. Byte-compatible with EMS 4.x so existing
 * sessions and password hashes keep working after the migration:
 *  - tokens: compact JWS, HS256 over the UTF-8 SESSION_SECRET, base64url
 *  - passwords: `pbkdf2$<iterations>$<salt>$<base64url(sha256-derived 256 bits)>`
 *    where the salt is the base64url *string* (its UTF-8 bytes feed PBKDF2).
 * Comparisons are constant-time (the 4.x code used string equality).
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

/** Cloudflare Workers caps WebCrypto PBKDF2 at 100 000 iterations. */
export const PBKDF2_ITERATIONS = 100_000;

export function b64u(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]!);
  return btoa(s).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export function unb64u(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const keyCache = new Map<string, Promise<CryptoKey>>();
function hmacKey(secret: string): Promise<CryptoKey> {
  let k = keyCache.get(secret);
  if (!k) {
    k = crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
    keyCache.set(secret, k);
  }
  return k;
}

/** Constant-time comparison of two strings. */
export function safeEqual(a: string, b: string): boolean {
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export async function signToken(payload: Record<string, unknown>, secret: string): Promise<string> {
  const h = b64u(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const p = b64u(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(`${h}.${p}`));
  return `${h}.${p}.${b64u(sig)}`;
}

/** Verifies signature + `exp` (seconds). Returns the payload or null. */
export async function verifyToken<T extends { exp?: number }>(token: string | null | undefined, secret: string): Promise<T | null> {
  if (!token) return null;
  const [h, p, s, extra] = String(token).split('.');
  if (!h || !p || !s || extra !== undefined) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), unb64u(s), enc.encode(`${h}.${p}`));
    if (!ok) return null;
    const data = JSON.parse(dec.decode(unb64u(p))) as T;
    return typeof data.exp === 'number' && data.exp > Date.now() / 1000 ? data : null;
  } catch {
    return null;
  }
}

async function derive(password: string, salt: string, iterations: number): Promise<string> {
  const material = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations, hash: 'SHA-256' }, material, 256);
  return b64u(bits);
}

export async function hashPassword(password: string, salt = b64u(crypto.getRandomValues(new Uint8Array(16)))): Promise<string> {
  return `pbkdf2$${PBKDF2_ITERATIONS}$${salt}$${await derive(password, salt, PBKDF2_ITERATIONS)}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  const [scheme, i, salt, expected] = String(stored).split('$');
  const iterations = Number(i);
  if (scheme !== 'pbkdf2' || !salt || !expected || !iterations || iterations > PBKDF2_ITERATIONS) return false;
  return safeEqual(await derive(String(password ?? ''), salt, iterations), expected);
}

/** SHA-256 hex digest (API keys, idempotency keys). */
export async function sha256Hex(value: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(value));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
