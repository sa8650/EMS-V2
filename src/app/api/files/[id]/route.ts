import { can } from '@/lib/permissions';
import { requireShop } from '@/server/auth/guards';
import { getEnv } from '@/server/env';
import { attachment } from '@/server/services/app-store';
import { fileForDownload, INLINE_SAFE } from '@/server/services/vaultium';

/** Downloads (or, for safe types with ?view=1, shows) a Vaultium file of the signed-in shop. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireShop();
  if (!can(ctx.permissions, 'vaultium', 'view')) return Response.json({ error: 'Permission denied.' }, { status: 403 });
  const { id } = await params;
  const [file, env] = await Promise.all([/^[0-9a-f-]{36}$/i.test(id) ? fileForDownload(ctx.db, ctx.shop.id, id) : null, getEnv()]);
  if (!file || !env.FILES) return Response.json({ error: 'File not found.' }, { status: 404 });
  const object = await env.FILES.get(file.r2_key);
  if (!object || !('body' in object)) return Response.json({ error: 'File not found.' }, { status: 404 });
  const inline = new URL(request.url).searchParams.get('view') === '1' && INLINE_SAFE.test(file.content_type);
  return new Response(object.body, {
    headers: {
      'content-type': inline ? file.content_type : 'application/octet-stream',
      'content-disposition': inline ? `inline; filename*=UTF-8''${encodeURIComponent(file.filename)}` : attachment(file.filename),
      'content-length': String(object.size),
      'x-content-type-options': 'nosniff',
      'content-security-policy': "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'",
    },
  });
}
