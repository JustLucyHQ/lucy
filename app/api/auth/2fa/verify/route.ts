import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resolveMemoryAuth } from '@/lib/memory/auth';
import { confirmCode } from '@/lib/email/codes';
import { checkRateLimit } from '@/lib/api/rate-limit';
import {
  TWOFA_COOKIE_NAME,
  TWOFA_COOKIE_TTL_SECONDS,
  getTwofaSecret,
  signTwofaCookie,
} from '@/lib/auth/twofa-cookie';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Keyed by userId (not IP) — the threat model here is a hijacked/compromised
// session brute-forcing its own emailed code, not an anonymous IP flood.
const RATE_LIMIT_MAX = 10;

export async function POST(req: NextRequest) {
  const { userId } = await resolveMemoryAuth(req);
  if (!userId) return Response.json({ ok: false }, { status: 401 });

  const { limited } = checkRateLimit('2fa-verify', userId, RATE_LIMIT_MAX);
  if (limited) return Response.json({ ok: false, reason: 'mismatch' }); // same shape as a wrong-code failure

  const { code } = await req.json().catch(() => ({}));
  if (typeof code !== 'string') return Response.json({ ok: false, reason: 'mismatch' });

  const url = (process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !svcKey) return Response.json({ ok: false, reason: 'no_code' });

  const svc = createClient(url, svcKey, { db: { schema: 'lucy' } });
  const verdict = await confirmCode(svc, userId, code, '2fa');

  const res = NextResponse.json(verdict);
  if (verdict.ok) {
    // Signed httpOnly cookie that proxy.ts checks server-side — the
    // sessionStorage flag alone is client-side UX, not enforcement.
    const secret = getTwofaSecret();
    if (secret) {
      res.cookies.set(TWOFA_COOKIE_NAME, signTwofaCookie(userId, secret), {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: TWOFA_COOKIE_TTL_SECONDS,
        path: '/',
      });
    }
  }
  return res;
}
