// app/api/workflows/runs/[runId]/cancel/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { resolveMemoryAuth } from '@/lib/memory/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const { userId, client } = await resolveMemoryAuth(req);
  if (!userId || !client) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { runId } = await params;

  const { data: run } = await client
    .from('workflow_runs')
    .select('id, status')
    .eq('id', runId)
    .eq('user_id', userId)
    .single();
  if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (run.status === 'queued') {
    await client.from('workflow_runs')
      .update({ status: 'canceled', completed_at: new Date().toISOString() })
      .eq('id', runId).eq('user_id', userId);
    return NextResponse.json({ status: 'canceled' });
  }
  if (run.status === 'running') {
    await client.from('workflow_runs')
      .update({ cancel_requested: true })
      .eq('id', runId).eq('user_id', userId);
    return NextResponse.json({ status: 'canceling' });
  }
  return NextResponse.json({ status: run.status });
}
