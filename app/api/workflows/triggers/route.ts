// app/api/workflows/triggers/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { resolveMemoryAuth } from '@/lib/memory/auth';
import { nextRunAfter } from '@/lib/workflow/cron';
import { validateTriggerBody } from './validate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { userId, client } = await resolveMemoryAuth(req);
  if (!userId || !client) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const workflowId = req.nextUrl.searchParams.get('workflowId');

  let q = client
    .from('workflow_triggers')
    .select('id, workflow_id, name, type, settings, enabled, secret, next_run_at, last_enqueued_at, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (workflowId) q = q.eq('workflow_id', workflowId);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ triggers: data ?? [] });
}

export async function POST(req: NextRequest) {
  const { userId, client } = await resolveMemoryAuth(req);
  if (!userId || !client) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const v = validateTriggerBody(await req.json().catch(() => null));
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: v.status });

  const row: Record<string, unknown> = {
    user_id: userId,
    workflow_id: v.workflowId,
    name: v.name,
    type: v.type,
    settings: v.settings,
    definition: v.definition,
    inputs: v.inputs,
    enabled: true,
  };
  if (v.type === 'cron') {
    if (v.settings.run_once) {
      row.next_run_at = new Date(String(v.settings.run_at)).toISOString();
    } else {
      const tz = typeof v.settings.timezone === 'string' ? v.settings.timezone : undefined;
      row.next_run_at = nextRunAfter(String(v.settings.expr), new Date(), tz)?.toISOString() ?? null;
    }
  }
  if (v.type === 'webhook') {
    row.secret = randomBytes(24).toString('base64url');
  }

  const { data, error } = await client.from('workflow_triggers').insert(row).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ trigger: data });
}
