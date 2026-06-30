// app/api/workflows/triggers/[id]/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHmac, timingSafeEqual } from 'crypto';
import { checkRateLimit, getClientIp } from '@/lib/api/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, x-webhook-token, x-signature, x-timestamp, idempotency-key',
  'Access-Control-Max-Age': '86400',
};

/** Constant-time string compare (avoids leaking the secret via timing). */
function safeEq(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
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

  const raw = await req.text();
  const secret = (trigger?.secret as string) || '';
  // Accept EITHER the shared token (query or header) OR an HMAC-SHA256 signature of the
  // raw body (x-signature: sha256=<hex>) — so signed providers can verify without a URL token.
  const token = req.nextUrl.searchParams.get('token') || req.headers.get('x-webhook-token') || '';
  const sig = (req.headers.get('x-signature') || '').replace(/^sha256=/i, '');
  const okToken = !!secret && !!token && safeEq(token, secret);
  const okHmac = !!secret && !!sig && safeEq(sig, createHmac('sha256', secret).update(raw).digest('hex'));
  if (!trigger || trigger.type !== 'webhook' || !trigger.enabled || !secret || !(okToken || okHmac)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  // Optional replay protection: when a signed caller supplies x-timestamp, reject stale requests.
  const ts = req.headers.get('x-timestamp');
  if (ts) {
    const age = Math.abs(Date.now() - Number(ts));
    if (!Number.isFinite(age) || age > 5 * 60 * 1000) return json({ error: 'Stale request' }, 401);
  }

  let body: Record<string, unknown> = {};
  try {
    body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    body = {};
  }
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
  void svc.from('workflow_triggers').update({ last_enqueued_at: new Date().toISOString() }).eq('id', id).then(() => {});
  return json({ runId: data.id });
}
