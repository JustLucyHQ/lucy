// POST /api/auth/devices/others { fingerprint } — sign out every other device.
// Revokes the account's other sessions (Supabase scope 'others'), then drops the other device rows;
// this browser (its fingerprint) stays signed in and listed.
import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resolveMemoryAuth } from '@/lib/memory/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { userId, email, client } = await resolveMemoryAuth(req);
  if (!userId || !email || !client) return Response.json({ ok: false, error: 'Sign in first.' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const fingerprint = typeof body.fingerprint === 'string' ? body.fingerprint : '';

  const { error } = await client.auth.signOut({ scope: 'others' });
  if (error) return Response.json({ ok: false, error: 'Could not sign out the other devices. Try again.' }, { status: 500 });

  const url = process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && svcKey) {
    const svc = createClient(url, svcKey, { db: { schema: 'lucy' } });
    await svc.from('member_devices').delete().eq('user_id', userId).neq('fingerprint', fingerprint);
  }
  return Response.json({ ok: true });
}
