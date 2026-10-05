// app/api/workflows/triggers/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { resolveMemoryAuth } from '@/lib/memory/auth';
import { nextRunAfter } from '@/lib/workflow/cron';
import { validateTriggerBody } from './validate';
import { encryptSecret, decryptSecretMaybe } from '@/lib/mcp/secret';

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
  // The webhook secret is encrypted at rest; its OWNER sees it in the triggers panel (webhook URL + HMAC key), so open it here.
  const triggers = (data ?? []).map((t) => ({ ...t, secret: t.secret ? decryptSecretMaybe(t.secret as string) || null : null }));
  return NextResponse.json({ triggers });
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
  let webhookSecret: string | null = null;
  if (v.type === 'webhook') {
    webhookSecret = randomBytes(24).toString('base64url');
    row.secret = encryptSecret(webhookSecret); // encrypted at rest (lib/mcp/secret.ts); the owner gets the plaintext below
  }

  const { data, error } = await client.from('workflow_triggers').insert(row).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ trigger: webhookSecret ? { ...data, secret: webhookSecret } : data });
}
