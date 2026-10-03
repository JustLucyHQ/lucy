import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resolveSessionUserId } from '@/lib/memory/auth';
import { requestEmailCode } from '@/lib/email/request-code';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/signup/request — send the sign-up confirmation code. Body `{ resend: true }` = "Resend code";
 * without it (the confirm page opening) a code goes out only when no valid one is out yet.
 * Answers `{ ok, sent, email, retryInSec? }`.
 */
export async function POST(req: NextRequest) {
  // resolveSessionUserId (not resolveMemoryAuth) — this route's whole job is to
  // SATISFY the email-verification gate, so it must not itself be blocked by it.
  const { userId, email } = await resolveSessionUserId(req);
  if (!userId || !email) return Response.json({ ok: false }, { status: 401 });
  const body = await req.json().catch(() => ({}));

  const url = (process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !svcKey) return Response.json({ ok: false }, { status: 500 });

  const svc = createClient(url, svcKey, { db: { schema: 'lucy' } });
  return Response.json(await requestEmailCode(svc, userId, email, 'signup', 'signupConfirm', body?.resend === true));
}
