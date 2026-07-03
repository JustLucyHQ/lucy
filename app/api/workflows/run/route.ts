// app/api/workflows/run/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { resolveMemoryAuth } from '@/lib/memory/auth';
import { validateRunBody } from './validate';
import { checkRateLimit } from '@/lib/api/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Each call enqueues a run for the async worker — bound how fast one user can
// flood the queue.
const RATE_LIMIT_MAX = 30;

export async function POST(req: NextRequest) {
  const { userId, client } = await resolveMemoryAuth(req);
  if (!userId || !client) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { limited, retryAfterSeconds } = checkRateLimit('workflows-run', userId, RATE_LIMIT_MAX);
  if (limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }
    );
  }

  const v = validateRunBody(await req.json().catch(() => null));
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: v.status });

  const { data, error } = await client
    .from('workflow_runs')
    .insert({
      user_id: userId,
      workflow_id: v.workflowId,
      name: v.name,
      definition: v.definition,
      inputs: v.inputs,
      status: 'queued',
      enqueued_at: new Date().toISOString(),
      trigger: 'manual',
    })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ runId: data.id });
}
