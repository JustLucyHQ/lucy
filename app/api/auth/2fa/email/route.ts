// POST /api/auth/2fa/email { enabled } — turn the e-mail sign-in code on or off.
// Server-only on purpose: the flag decides whether sign-in asks for a code, so it must never be writable
// straight from the browser (lib/supabase/user_profiles_lockdown.sql). resolveMemoryAuth only lets through a
// session that already passed 2FA, so a password alone cannot switch it off.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resolveMemoryAuth } from '@/lib/memory/auth';
import { getTwofaSecret, signTwofaCookie, TWOFA_COOKIE_NAME, TWOFA_COOKIE_TTL_SECONDS } from '@/lib/auth/twofa-cookie';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { userId, email } = await resolveMemoryAuth(req);
  if (!userId || !email) return NextResponse.json({ ok: false, error: 'Sign in first.' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  if (typeof body.enabled !== 'boolean') return NextResponse.json({ ok: false, error: 'Invalid request' }, { status: 400 });

  const url = process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !svcKey) return NextResponse.json({ ok: false, error: 'Not available here.' }, { status: 503 });
  const svc = createClient(url, svcKey, { db: { schema: 'lucy' } });

  const { error } = await svc
    .from('user_profiles')
    .upsert({ user_id: userId, two_factor_email_enabled: body.enabled }, { onConflict: 'user_id' });
  if (error) return NextResponse.json({ ok: false, error: 'Could not save. Try again.' }, { status: 500 });

  const res = NextResponse.json({ ok: true, enabled: body.enabled });
  // Turning it on mid-session: this session counts as having passed the code, so the person isn't thrown out
  // now — the code is asked from the next sign-in on.
  const secret = getTwofaSecret();
  if (body.enabled && secret) {
    res.cookies.set(TWOFA_COOKIE_NAME, signTwofaCookie(userId, secret), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: TWOFA_COOKIE_TTL_SECONDS,
      path: '/',
    });
  }
  return res;
}
