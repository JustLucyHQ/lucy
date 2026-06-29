import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resolveMemoryAuth } from '@/lib/memory/auth';
import { getInstallations, install, uninstall, patchInstall, maskConfig, validateConfig } from '@/lib/mcp/installer';
import { getServer } from '@/lib/mcp/registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
function svc() { return createClient((process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { db: { schema: 'lucy' } }); }

export async function GET(req: NextRequest) {
  const { userId } = await resolveMemoryAuth(req);
  if (!userId) return Response.json({ installations: [] });
  const s = svc();
  const rows = await getInstallations(s, userId);
  const out = [];
  for (const r of rows) {
    const server = await getServer(s, r.server_slug);
    out.push({ server_slug: r.server_slug, enabled: r.enabled, require_approval: r.require_approval,
      config: maskConfig(server?.config_schema ?? [], r.config ?? {}) });   // secrets masked
  }
  return Response.json({ installations: out });
}

export async function POST(req: NextRequest) {
  const { userId } = await resolveMemoryAuth(req);
  if (!userId) return Response.json({ ok: false }, { status: 401 });
  const { slug, config } = await req.json().catch(() => ({}));
  const s = svc();
  const server = await getServer(s, slug);
  if (!server) return Response.json({ ok: false, error: 'unknown connector' }, { status: 404 });
  const v = validateConfig(server.config_schema ?? [], config ?? {});
  if (!v.ok) return Response.json({ ok: false, error: v.error }, { status: 400 });
  await install(s, userId, slug, config ?? {}, server.config_schema ?? []);
  return Response.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const { userId } = await resolveMemoryAuth(req);
  if (!userId) return Response.json({ ok: false }, { status: 401 });
  const { slug, enabled, require_approval } = await req.json().catch(() => ({}));
  await patchInstall(svc(), userId, slug, { enabled, require_approval });
  return Response.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { userId } = await resolveMemoryAuth(req);
  if (!userId) return Response.json({ ok: false }, { status: 401 });
  const slug = new URL(req.url).searchParams.get('slug');
  if (!slug) return Response.json({ ok: false }, { status: 400 });
  await uninstall(svc(), userId, slug);
  return Response.json({ ok: true });
}
