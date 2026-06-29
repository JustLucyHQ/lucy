// app/api/workflows/runs/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { resolveMemoryAuth } from '@/lib/memory/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { userId, client } = await resolveMemoryAuth(req);
  if (!userId || !client) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const workflowId = searchParams.get('workflowId');
  const limit = Math.min(Number(searchParams.get('limit')) || 20, 100);

  let q = client
    .from('workflow_runs')
    .select('id, status, name, error, enqueued_at, started_at, completed_at')
    .eq('user_id', userId)
    .order('enqueued_at', { ascending: false })
    .limit(limit);
  if (workflowId) q = q.eq('workflow_id', workflowId);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ runs: data ?? [] });
}
