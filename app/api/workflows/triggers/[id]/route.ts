// app/api/workflows/triggers/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { resolveMemoryAuth } from '@/lib/memory/auth';
import { isValidCron, nextRunAfter } from '@/lib/workflow/cron';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId, client } = await resolveMemoryAuth(req);
  if (!userId || !client) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as
    | { enabled?: boolean; name?: string; settings?: { expr?: string; timezone?: string }; definition?: unknown }
    | null;
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;
  if (typeof body.name === 'string') patch.name = body.name;
  if (body.definition) patch.definition = body.definition;
  if (body.settings) {
    patch.settings = body.settings;
    if (typeof body.settings.expr === 'string') {
      if (!isValidCron(body.settings.expr)) return NextResponse.json({ error: 'Invalid cron expression' }, { status: 400 });
      patch.next_run_at = nextRunAfter(body.settings.expr, new Date(), body.settings.timezone)?.toISOString() ?? null;
    }
  }

  const { data, error } = await client
    .from('workflow_triggers')
    .update(patch)
    .eq('id', id)
    .eq('user_id', userId)
    .select('id, name, type, settings, enabled, next_run_at')
    .single();
  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ trigger: data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId, client } = await resolveMemoryAuth(req);
  if (!userId || !client) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const { error } = await client.from('workflow_triggers').delete().eq('id', id).eq('user_id', userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
