// app/api/workflows/triggers/[id]/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit, getClientIp } from '@/lib/api/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, x-webhook-token',
  'Access-Control-Max-Age': '86400',
};
const json = (b: unknown, status = 200) => NextResponse.json(b, { status, headers: CORS });

function service() {
  const url = (process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { db: { schema: 'lucy' } });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rl = checkRateLimit('wf-webhook', getClientIp(req), 60);
  if (rl.limited) return json({ error: 'Rate limited' }, 429);

  const svc = service();
  if (!svc) return json({ error: 'Service unavailable' }, 503);

  const { data: trigger } = await svc
    .from('workflow_triggers')
    .select('id, user_id, workflow_id, name, definition, inputs, enabled, secret, type')
    .eq('id', id)
    .single();

  const token = req.nextUrl.searchParams.get('token') || req.headers.get('x-webhook-token') || '';
  if (!trigger || trigger.type !== 'webhook' || !trigger.enabled || !trigger.secret || token !== trigger.secret) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const inputs = { ...(trigger.inputs as Record<string, unknown>), ...(body && typeof body === 'object' ? body : {}) };

  // Optional caller-supplied idempotency key dedupes retried deliveries.
  const idemHeader = req.headers.get('idempotency-key');
  const idempotency_key = idemHeader ? `wh:${id}:${idemHeader}` : null;

  const { data, error } = await svc.from('workflow_runs').insert({
    user_id: trigger.user_id,
    workflow_id: trigger.workflow_id,
    name: trigger.name,
    definition: trigger.definition,
    inputs,
    status: 'queued',
    enqueued_at: new Date().toISOString(),
    trigger: 'webhook',
    max_attempts: 3,
    idempotency_key,
  }).select('id').single();

  if (error) {
    // Idempotency replay: return the existing run rather than a 500.
    if ((error as { code?: string }).code === '23505' && idempotency_key) {
      const { data: existing } = await svc.from('workflow_runs').select('id').eq('idempotency_key', idempotency_key).single();
      if (existing) return json({ runId: existing.id, deduped: true });
    }
    return json({ error: 'Could not enqueue' }, 500);
  }
  return json({ runId: data.id });
}
