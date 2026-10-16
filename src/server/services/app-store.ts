import 'server-only';
import type { Database, RowOf } from '@/server/db';
import type { AppEnv } from '@/server/env';
import { AppError } from '@/server/errors';

/**
 * App Store: Android apps published by the owner. Files live in the FILES R2
 * bucket under apps/<package>/…, or the APK is an external HTTPS link.
 * The public URLs (/api/app-store/…) are used by the installed apps.
 */

type App = RowOf<'app_store_apps'>;

export const appKeyPrefix = (pkg: string) => `apps/${pkg}/`;
export const isAppKey = (key: string | null | undefined, pkg: string): key is string => !!key && key.startsWith(appKeyPrefix(pkg)) && !key.includes('..');
export const downloadPath = (pkg: string) => `/api/app-store/download/${encodeURIComponent(pkg)}`;
export const iconUrl = (app: Pick<App, 'icon_r2_key' | 'icon_url' | 'package_name'>) =>
  isAppKey(app.icon_r2_key, app.package_name) ? `/api/app-store/file/${app.icon_r2_key.split('/').map(encodeURIComponent).join('/')}` : app.icon_url;

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$)/i;

export function externalApkUrl(app: Pick<App, 'apk_url'>): string | null {
  if (!app.apk_url) return null;
  try {
    const url = new URL(app.apk_url);
    if (url.protocol !== 'https:' || url.username || url.password || PRIVATE_HOST.test(url.hostname) || url.pathname.startsWith('/api/app-store/')) return null;
    return url.href;
  } catch {
    return null;
  }
}

export type ReleaseStatus = { available: false } | { available: true; source: 'r2'; key: string } | { available: true; source: 'external'; url: string };

/** A release counts only if a downloadable APK actually exists. */
export async function releaseStatus(env: AppEnv, app: App): Promise<ReleaseStatus> {
  if (isAppKey(app.apk_r2_key, app.package_name) && env.FILES) {
    const head = await env.FILES.head(app.apk_r2_key).catch(() => null);
    if (head) return { available: true, source: 'r2', key: app.apk_r2_key };
  }
  const url = externalApkUrl(app);
  return url ? { available: true, source: 'external', url } : { available: false };
}

export async function publishedApps(db: Database): Promise<App[]> {
  return db.from('app_store_apps').select('*').eq('published', true).order('title');
}

export async function publishedApp(db: Database, pkg: string): Promise<App | null> {
  const apps = await publishedApps(db);
  return apps.find((a) => a.package_name.toLowerCase() === pkg.toLowerCase()) ?? null;
}

/** Response of GET /api/app-store/check-update (field names kept for installed apps). */
export function updateInfo(app: App, installedVersionCode: number, origin: string) {
  const downloadUrl = new URL(downloadPath(app.package_name), origin).href;
  const installed = Number.isSafeInteger(installedVersionCode) && installedVersionCode >= 0 ? installedVersionCode : 0;
  return {
    ok: true,
    hasUpdate: app.version_code > installed,
    title: app.title,
    description: app.description,
    latestVersion: app.version,
    version: app.version,
    versionCode: app.version_code,
    version_code: app.version_code,
    mandatory: app.mandatory,
    downloadUrl,
    download_url: downloadUrl,
    apk_filename: app.apk_filename,
    apk_size_bytes: Number(app.apk_size_bytes ?? 0),
    releaseNotes: app.release_notes ?? '',
    release_notes: app.release_notes ?? '',
    updated_at: app.updated_at,
  };
}

export const attachment = (filename: string) => `attachment; filename="${filename.replace(/["\\\r\n]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(filename)}`;

/* ───────────────────────────── owner: publishing ───────────────────────────── */

const MAX_APK_BYTES = 100 * 1024 * 1024;
const ICON_TYPES = /^image\/(png|jpe?g|webp)$/i;

export interface AppInput {
  package_name: string;
  title: string;
  description: string | null;
  version: string;
  version_code: number;
  release_notes: string | null;
  mandatory: boolean;
  published: boolean;
  apk_url: string | null;
  icon_url: string | null;
}

export function parseAppForm(form: FormData): AppInput {
  const text = (k: string, max: number) => String(form.get(k) ?? '').trim().slice(0, max);
  const pkg = text('package_name', 120).toLowerCase();
  if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(pkg)) throw new AppError('Enter a valid Android package name, e.g. com.example.app.', 400, { package_name: 'Like com.example.app' });
  const code = Number(form.get('version_code'));
  if (!Number.isInteger(code) || code < 1) throw new AppError('The version code must be a whole number above 0.', 400, { version_code: 'Whole number' });
  const https = (k: string) => {
    const v = text(k, 500);
    if (v && !v.startsWith('https://')) throw new AppError('Links must start with https://', 400, { [k]: 'Use https://' });
    return v || null;
  };
  const title = text('title', 120);
  const version = text('version', 40);
  if (!title || !version) throw new AppError('Enter a title and a version.', 400);
  return {
    package_name: pkg, title, description: text('description', 2000) || null, version, version_code: code, release_notes: text('release_notes', 4000) || null,
    mandatory: form.get('mandatory') === 'on', published: form.get('published') === 'on', apk_url: https('apk_url'), icon_url: https('icon_url'),
  };
}

export async function allApps(db: Database) {
  return db.from('app_store_apps').select('*').order('title');
}

/** Creates or updates an app; optional APK and icon files go to R2. */
export async function saveApp(db: Database, env: AppEnv, id: string | null, input: AppInput, apk: File | null, icon: File | null) {
  const existing = id ? await db.from('app_store_apps').select('*').eq('id', id).maybeSingle() : null;
  if (id && !existing) throw new AppError('App not found.', 404);
  const patch: Partial<App> = { ...input };
  const uploaded: string[] = [];
  try {
    if (apk && apk.size > 0) {
      if (!env.FILES) throw new AppError('File storage (R2 FILES) is not set up; publish the APK by link instead.', 503);
      if (apk.size > MAX_APK_BYTES) throw new AppError('The APK is larger than 100 MB.', 400);
      if (!/\.apk$/i.test(apk.name)) throw new AppError('Upload an .apk file.', 400, { apk: 'Must be an .apk file' });
      const key = `${appKeyPrefix(input.package_name)}${input.version_code}-${apk.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      await env.FILES.put(key, await apk.arrayBuffer(), { httpMetadata: { contentType: 'application/vnd.android.package-archive' } });
      uploaded.push(key);
      Object.assign(patch, { apk_r2_key: key, apk_filename: apk.name.slice(0, 200), apk_size_bytes: apk.size });
    }
    if (icon && icon.size > 0) {
      if (!env.FILES) throw new AppError('File storage (R2 FILES) is not set up; use an icon link instead.', 503);
      if (!ICON_TYPES.test(icon.type) || icon.size > 2 * 1024 * 1024) throw new AppError('The icon must be a PNG, JPEG or WebP image up to 2 MB.', 400, { icon: 'PNG/JPEG/WebP ≤ 2 MB' });
      const key = `${appKeyPrefix(input.package_name)}icon-${crypto.randomUUID()}.${icon.type.split('/')[1]}`;
      await env.FILES.put(key, await icon.arrayBuffer(), { httpMetadata: { contentType: icon.type } });
      uploaded.push(key);
      patch.icon_r2_key = key;
    }
    if (input.published && !patch.apk_r2_key && !existing?.apk_r2_key && !input.apk_url) throw new AppError('Upload an APK or give a download link before publishing.', 400);
    if (existing) await db.from('app_store_apps').eq('id', existing.id).update(patch);
    else await db.from('app_store_apps').insert(patch);
  } catch (e) {
    if (uploaded.length) await env.FILES?.delete(uploaded).catch(() => undefined);
    throw e;
  }
  if (existing && env.FILES) {
    const stale = [patch.apk_r2_key && existing.apk_r2_key, patch.icon_r2_key && existing.icon_r2_key].filter((k): k is string => !!k && !uploaded.includes(k));
    if (stale.length) await env.FILES.delete(stale).catch(() => undefined);
  }
}

export async function deleteApp(db: Database, env: AppEnv, id: string) {
  const [row] = await db.from('app_store_apps').eq('id', id).delete();
  if (!row) throw new AppError('App not found.', 404);
  const keys = [row.apk_r2_key, row.icon_r2_key].filter((k): k is string => !!k);
  if (keys.length) await env.FILES?.delete(keys).catch(() => undefined);
}
