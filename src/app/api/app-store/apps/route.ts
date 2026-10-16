import { getDb } from '@/server/db';
import { getEnv } from '@/server/env';
import { downloadPath, iconUrl, publishedApps, releaseStatus } from '@/server/services/app-store';

/** Published apps with download links (public). */
export async function GET(request: Request) {
  const [db, env] = await Promise.all([getDb(), getEnv()]);
  const apps = await publishedApps(db);
  const origin = new URL(request.url).origin;
  const list = await Promise.all(
    apps.map(async (a) => ({
      package_name: a.package_name,
      title: a.title,
      description: a.description,
      version: a.version,
      version_code: a.version_code,
      mandatory: a.mandatory,
      release_notes: a.release_notes,
      apk_size_bytes: Number(a.apk_size_bytes ?? 0),
      icon_url: iconUrl(a) ? new URL(iconUrl(a)!, origin).href : null,
      download_url: (await releaseStatus(env, a)).available ? new URL(downloadPath(a.package_name), origin).href : null,
      updated_at: a.updated_at,
    })),
  );
  return Response.json(list);
}
