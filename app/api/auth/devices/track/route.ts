import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resolveMemoryAuth } from '@/lib/memory/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { userId } = await resolveMemoryAuth(req);
  if (!userId) return Response.json({ ok: false }, { status: 401 });
  const b = await req.json().catch(() => ({}));

  const url = (process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !svcKey) return Response.json({ ok: false }, { status: 500 });
  const svc = createClient(url, svcKey, { db: { schema: 'lucy' } });

  await svc.from('member_devices').update({ is_current: false }).eq('user_id', userId);
  await svc.from('member_devices').upsert({
    user_id: userId, fingerprint: String(b.fingerprint ?? ''), device_name: b.deviceName ?? null,
    device_type: b.deviceType ?? null, browser: b.browser ?? null, os: b.os ?? null,
    ip_address: b.ipAddress ?? null, is_current: true, last_active_at: new Date().toISOString(),
  }, { onConflict: 'user_id,fingerprint' });
  return Response.json({ ok: true });
}
