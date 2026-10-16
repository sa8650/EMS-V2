import { getDb } from '@/server/db';
import { getEnv } from '@/server/env';
import { attachment, publishedApp, releaseStatus } from '@/server/services/app-store';

async function serve(request: Request, pkg: string, head: boolean) {
  const [db, env] = await Promise.all([getDb(), getEnv()]);
  const app = await publishedApp(db, decodeURIComponent(pkg));
  if (!app) return Response.json({ error: 'App not found.' }, { status: 404 });
  const status = await releaseStatus(env, app);
  if (!status.available) return Response.json({ error: 'This release is not available for download yet.' }, { status: 503 });
  if (status.source === 'external') return Response.redirect(status.url, 302);
  const object = head ? await env.FILES!.head(status.key) : await env.FILES!.get(status.key);
  if (!object) return Response.json({ error: 'File not found.' }, { status: 404 });
  const body = head || !('body' in object) ? null : object.body;
  return new Response(body, {
    headers: {
      'content-type': 'application/vnd.android.package-archive',
      'content-disposition': attachment(app.apk_filename || `${app.package_name}.apk`),
      'content-length': String(object.size),
      'cache-control': 'public, max-age=300',
      'x-content-type-options': 'nosniff',
    },
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ pkg: string }> }) {
  return serve(request, (await params).pkg, false);
}

export async function HEAD(request: Request, { params }: { params: Promise<{ pkg: string }> }) {
  return serve(request, (await params).pkg, true);
}
