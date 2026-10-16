import { getDb } from '@/server/db';
import { getEnv } from '@/server/env';
import { publishedApp, releaseStatus, updateInfo } from '@/server/services/app-store';

/** Used by the installed Android apps: GET ?package=<name>&versionCode=<n>. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const pkg = (url.searchParams.get('package') ?? 'com.ems.connectx').trim();
  const [db, env] = await Promise.all([getDb(), getEnv()]);
  const app = await publishedApp(db, pkg);
  if (!app) return Response.json({ error: 'No published release for this app.' }, { status: 404 });
  if (!(await releaseStatus(env, app)).available) {
    return Response.json({ error: 'The latest release is registered, but its APK is not available yet.' }, { status: 503 });
  }
  const installed = Number(url.searchParams.get('versionCode') ?? url.searchParams.get('version_code') ?? 0);
  return Response.json(updateInfo(app, installed, url.origin));
}
