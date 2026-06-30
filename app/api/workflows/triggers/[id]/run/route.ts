// app/api/workflows/triggers/[id]/run/route.ts
// Test-fire: enqueue a run for a trigger immediately (manual), regardless of its schedule/event.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resolveMemoryAuth } from '@/lib/memory/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function service() {
  const url = process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { db: { schema: 'lucy' } });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await resolveMemoryAuth(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const svc = service();
  if (!svc) return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });

  // Verify ownership before firing.
  const { data: t } = await svc
    .from('workflow_triggers')
    .select('id, user_id, workflow_id, name, definition, inputs')
    .eq('id', id)
    .eq('user_id', userId)
    .single();
  if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { inputs?: Record<string, unknown> };
  const inputs = {
    ...(t.inputs as Record<string, unknown>),
    ...(body.inputs && typeof body.inputs === 'object' ? body.inputs : {}),
    manual_test: true,
  };

  const { data, error } = await svc
    .from('workflow_runs')
    .insert({
      user_id: userId,
      workflow_id: t.workflow_id,
      name: t.name,
      definition: t.definition,
      inputs,
      status: 'queued',
      enqueued_at: new Date().toISOString(),
      trigger: 'manual',
      max_attempts: 1,
    })
    .select('id')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ runId: data.id });
}
