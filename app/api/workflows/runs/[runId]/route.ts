// app/api/workflows/runs/[runId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { resolveMemoryAuth } from '@/lib/memory/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const { userId, client } = await resolveMemoryAuth(req);
  if (!userId || !client) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { runId } = await params;

  const { data, error } = await client
    .from('workflow_runs')
    .select('id, status, name, inputs, outputs, logs, error, attempt, max_attempts, enqueued_at, started_at, completed_at')
    .eq('id', runId)
    .eq('user_id', userId)
    .single();

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ run: data });
}
