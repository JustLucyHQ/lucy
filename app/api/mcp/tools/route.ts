import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resolveMemoryAuth } from '@/lib/memory/auth';
import { connectAny } from '@/lib/mcp/resolve';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function svc() {
  return createClient(
    (process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { db: { schema: 'lucy' } },
  );
}

export async function POST(req: NextRequest) {
  const { userId } = await resolveMemoryAuth(req);
  if (!userId) return Response.json({ ok: false }, { status: 401 });

  const { slug, tool, args } = await req.json().catch(() => ({}));
  if (!slug || !tool) return Response.json({ ok: false, error: 'slug and tool are required' }, { status: 400 });

  const s = svc();

  let conn;
  try {
    conn = await connectAny(s, userId, slug);
    if (!conn) return Response.json({ ok: false, error: 'not connected or unknown' }, { status: 404 });
    const result = await conn.callTool(tool, args ?? {});
    return Response.json({ ok: true, result });
  } catch (e) {
    console.error('[mcp/tools] tool execution failed:', e instanceof Error ? e.message : e);
    return Response.json({ ok: false, error: 'tool execution failed' }, { status: 500 });
  } finally {
    if (conn) await conn.close().catch(() => {});
  }
}
