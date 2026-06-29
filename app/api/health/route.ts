// app/api/health/route.ts — lightweight liveness/readiness probe for uptime monitoring.
import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/auth/admin';
import pkg from '@/package.json';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/health
 * 200 {ok:true,...} when the app is up (and Supabase reachable, when configured).
 * 503 when a configured Supabase can't be reached. Standalone (no Supabase) is
 * still "ok" — the app runs on localStorage. No auth required; never cached.
 */
export async function GET() {
  const startedAt = Date.now();
  const svc = getServiceClient();

  let supabase: 'ok' | 'down' | 'standalone' = 'standalone';
  if (svc) {
    try {
      const { error } = await svc.from('mcp_servers').select('slug').limit(1);
      supabase = error ? 'down' : 'ok';
    } catch {
      supabase = 'down';
    }
  }

  const ok = supabase !== 'down';
  return NextResponse.json(
    {
      ok,
      service: 'lucy',
      version: (pkg as { version?: string }).version ?? 'unknown',
      supabase,
      uptimeSeconds: Math.round(process.uptime()),
      checkMs: Date.now() - startedAt,
    },
    { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
