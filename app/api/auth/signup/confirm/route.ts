import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resolveSessionUserId } from '@/lib/memory/auth';
import { confirmCode } from '@/lib/email/codes';
import { checkRateLimit } from '@/lib/api/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Keyed by userId (not IP) — matches 2fa/verify's throttle.
const RATE_LIMIT_MAX = 10;

export async function POST(req: NextRequest) {
  // resolveSessionUserId (not resolveMemoryAuth) — this route's whole job is to
  // SATISFY the email-verification gate, so it must not itself be blocked by it.
  const { userId } = await resolveSessionUserId(req);
  if (!userId) return Response.json({ ok: false }, { status: 401 });

  const { limited } = checkRateLimit('signup-confirm', userId, RATE_LIMIT_MAX);
  if (limited) return Response.json({ ok: false, reason: 'mismatch' }); // same shape as a wrong-code failure

  const { code } = await req.json().catch(() => ({}));
  if (typeof code !== 'string') return Response.json({ ok: false, reason: 'mismatch' });

  const url = (process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !svcKey) return Response.json({ ok: false, reason: 'no_code' });

  const svc = createClient(url, svcKey, { db: { schema: 'lucy' } });
  const verdict = await confirmCode(svc, userId, code, 'signup');
  if (!verdict.ok) return Response.json(verdict);

  // Upsert — the profile row may not exist yet (it's only created at signup if
  // a company was provided).
  const { error } = await svc
    .from('user_profiles')
    .upsert({ user_id: userId, email_verified: true }, { onConflict: 'user_id' });
  if (error) return Response.json({ ok: false, reason: 'mismatch' });

  return Response.json({ ok: true });
}
