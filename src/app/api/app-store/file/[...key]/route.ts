import { getDb } from '@/server/db';
import { getEnv } from '@/server/env';
import { isAppKey, publishedApps } from '@/server/services/app-store';

/** Icons (and other images) of published apps, served from R2. */
export async function GET(_request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const key = (await params).key.map(decodeURIComponent).join('/');
  const [db, env] = await Promise.all([getDb(), getEnv()]);
  const app = (await publishedApps(db)).find((a) => a.icon_r2_key === key && isAppKey(key, a.package_name));
  if (!app || !env.FILES) return Response.json({ error: 'File not found.' }, { status: 404 });
  const object = await env.FILES.get(key);
  if (!object || !('body' in object)) return Response.json({ error: 'File not found.' }, { status: 404 });
  const type = object.httpMetadata?.contentType ?? '';
  return new Response(object.body, {
    headers: {
      'content-type': type.startsWith('image/') && type !== 'image/svg+xml' ? type : 'application/octet-stream',
      'cache-control': 'public, max-age=3600',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; sandbox",
    },
  });
}
