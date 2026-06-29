// /api/mcp/custom — add or remove a user's custom remote-MCP connector.
import { NextRequest } from 'next/server';
import { resolveMemoryAuth } from '@/lib/memory/auth';
import { createCustom, deleteCustom } from '@/lib/mcp/custom';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { userId } = await resolveMemoryAuth(req);
  if (!userId) return Response.json({ ok: false }, { status: 401 });

  const { name, url, token } = await req.json().catch(() => ({}));
  const trimmedUrl = String(url ?? '').trim();
  if (!name || !/^https?:\/\/.+/i.test(trimmedUrl)) {
    return Response.json({ ok: false, error: 'A name and a valid https:// URL are required.' }, { status: 400 });
  }
  try {
    const c = await createCustom(userId, String(name).slice(0, 80).trim(), trimmedUrl, token ? String(token) : null);
    return Response.json({ ok: true, slug: c.slug });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : 'Failed to add connector' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { userId } = await resolveMemoryAuth(req);
  if (!userId) return Response.json({ ok: false }, { status: 401 });
  const slug = new URL(req.url).searchParams.get('slug');
  if (!slug) return Response.json({ ok: false, error: 'slug required' }, { status: 400 });
  await deleteCustom(userId, slug);
  return Response.json({ ok: true });
}
