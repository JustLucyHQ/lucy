// POST /api/auth/password — change the signed-in person's password.
// The current password is checked first (a borrowed signed-in browser must not be enough to take the account),
// the new one must meet the password rule, and every other session is signed out afterwards.
import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resolveMemoryAuth } from '@/lib/memory/auth';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { checkPassword, PASSWORD_HINT } from '@/lib/auth/password-policy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Errors = Partial<Record<'current' | 'next' | 'confirm', string>>;
const fail = (errors: Errors, status = 400) => Response.json({ ok: false, errors }, { status });

export async function POST(req: NextRequest) {
  const { userId, email, client } = await resolveMemoryAuth(req);
  // Cookie sessions only (email is null for API-key callers) — a key must never change a password.
  if (!userId || !email || !client) return Response.json({ ok: false, error: 'Sign in first.' }, { status: 401 });

  const { limited } = checkRateLimit('password-change', userId, 5);
  if (limited) return Response.json({ ok: false, error: 'Too many attempts. Try again in a few minutes.' }, { status: 429 });

  const body = await req.json().catch(() => ({}));
  const current = typeof body.current === 'string' ? body.current : '';
  const next = typeof body.next === 'string' ? body.next : '';
  const confirm = typeof body.confirm === 'string' ? body.confirm : '';

  const errors: Errors = {};
  if (!current) errors.current = 'Enter your current password.';
  if (!checkPassword(next).ok) errors.next = PASSWORD_HINT;
  else if (next === current) errors.next = 'Choose a password different from the current one.';
  if (next !== confirm) errors.confirm = 'Passwords do not match.';
  if (Object.keys(errors).length) return fail(errors);

  const url = process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !svcKey) return Response.json({ ok: false, error: 'Not available here.' }, { status: 503 });
  const admin = createClient(url, svcKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // A Google-only account has no password to confirm — it sets one through "Forgot password" instead.
  const { data: found } = await admin.auth.admin.getUserById(userId);
  const hasPassword = (found.user?.identities ?? []).some((i) => i.provider === 'email');
  if (!hasPassword) {
    return Response.json({
      ok: false,
      error: 'You sign in with Google, so there is no password to change. To add one, sign out and use "Forgot password".',
    }, { status: 400 });
  }

  const probe = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: wrong } = await probe.auth.signInWithPassword({ email, password: current });
  if (wrong) return fail({ current: 'That is not your current password.' });
  await probe.auth.signOut({ scope: 'local' }).catch(() => {});

  const { error } = await admin.auth.admin.updateUserById(userId, { password: next });
  if (error) return Response.json({ ok: false, error: 'Could not change the password. Try again.' }, { status: 500 });

  // Anyone else holding a session (a stolen one included) is signed out; this browser stays signed in.
  await client.auth.signOut({ scope: 'others' }).catch(() => {});
  return Response.json({ ok: true });
}
