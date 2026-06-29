// app/api/workflows/run/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { resolveMemoryAuth } from '@/lib/memory/auth';
import { validateRunBody } from './validate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { userId, client } = await resolveMemoryAuth(req);
  if (!userId || !client) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
