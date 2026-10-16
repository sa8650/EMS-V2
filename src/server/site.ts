import 'server-only';
import { headers } from 'next/headers';

/** Public origin for links in documents and emails: SITE_URL, else the current request's host. */
export async function siteOrigin(): Promise<string> {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/+$/, '');
  const h = await headers();
  return `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost'}`;
}
