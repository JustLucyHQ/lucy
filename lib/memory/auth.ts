import type { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { validateApiKey } from '@/lib/auth/api-keys';
import { SUPABASE_COOKIE_NAME } from '@/lib/supabase/cookie';

// Loose client type so the lucy-schema client (schema generic = 'lucy') is accepted.
type LucyClient = SupabaseClient<any, any, any>;

export interface MemoryAuth {
  /** The authenticated user's id, or null if the request is unauthenticated. */
  userId: string | null;
  /** The authenticated user's email (cookie sessions only); used for admin gating. */
  email: string | null;
  /**
   * A Supabase client to use for memory operations. For cookie-session users this
   * is an RLS-scoped client (defense in depth); for Lucy API-key callers it is the
   * service client (app logic scopes it to userId). Null when no backend/auth.
   */
  client: LucyClient | null;
  /**
   * True when this specific request was rejected ONLY because the account has
   * an unconfirmed email (signup verification not yet completed) — as opposed
   * to having no valid session at all. Optional, additive.
   */
  emailVerificationRequired?: boolean;
  /**
   * True when this specific request was rejected ONLY because the account has
   * 2FA enabled and the session hasn't completed it (AAL1 / no verified email-2FA
   * cookie) — as opposed to having no valid session at all. Optional, additive:
   * routes that don't check it just see userId: null like any other auth failure.
   */
  twoFactorRequired?: boolean;
}

const UNAUTH: MemoryAuth = { userId: null, email: null, client: null };

interface SessionUser { userId: string; email: string | null; client: LucyClient }

/**
 * Resolve JUST the cookie-session user, with NEITHER the email-verification nor
 * the 2FA gate applied. For internal use by resolveMemoryAuth (which adds both
 * gates) and by the small set of routes whose own job is to SATISFY those gates
 * (signup/request, signup/confirm, 2fa/request, 2fa/verify) — those routes would
 * never be able to succeed if they were blocked by the very check they exist to
 * clear.
 */
async function resolveSessionUser(req: NextRequest): Promise<SessionUser | null> {
  const url = (process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;

  try {
    const client = createServerClient(url, anon, {
      db: { schema: 'lucy' },
      cookieOptions: { name: SUPABASE_COOKIE_NAME },
      cookies: {
        getAll: () => req.cookies.getAll(),
        // Token refresh needs the response object (handled by middleware); a
        // no-op here is fine — getUser still validates a non-expired access token.
        setAll: () => {},
      },
    }) as unknown as SupabaseClient;
    const {
      data: { user },
    } = await client.auth.getUser();
    if (user) return { userId: user.id, email: user.email ?? null, client };
  } catch (error) {
    // Fail closed — but log for debuggability.
    console.warn(
      '[memory/auth] session auth failed:',
      error instanceof Error ? error.message : 'unknown error'
    );
  }
  return null;
}

/**
 * Resolve the cookie-session user WITHOUT the email-verification/2FA gates —
 * for use only by signup/request, signup/confirm, 2fa/request, and 2fa/verify.
 */
export async function resolveSessionUserId(
  req: NextRequest
): Promise<{ userId: string | null; email: string | null; client: LucyClient | null }> {
  const su = await resolveSessionUser(req);
  return su ? { userId: su.userId, email: su.email, client: su.client } : { userId: null, email: null, client: null };
}

/**
 * Blocks access until the account's signup email has been confirmed (Lucy's
 * own code-based system — lib/email/codes.ts purpose 'signup' — not GoTrue's
 * native mailer, which is shared/unbranded across every product on this
 * Supabase instance). Returns true iff the account is NOT yet verified.
 */
async function emailVerificationOutstanding(client: SupabaseClient, userId: string): Promise<boolean> {
  try {
    const { data: prof } = await client
      .from('user_profiles')
      .select('email_verified')
      .eq('user_id', userId)
      .maybeSingle();
    // No profile row yet (first request right after signup, before the row is
    // created) — treat as unverified rather than silently letting it through.
    return prof ? !prof.email_verified : true;
  } catch {
    return false; // profile lookup failure — don't lock the user out over an unrelated error
  }
}

/**
 * Mirrors proxy.ts's AAL2/email-2FA enforcement, but for the API layer — proxy.ts
 * explicitly excludes /api/* from its checks (PUBLIC_PREFIXES includes '/api/'),
 * so without this a stolen AAL1 session cookie could call any API route directly
 * and fully bypass 2FA. Returns true iff 2FA is enabled on the account and this
 * session/request hasn't satisfied it yet.
 */
async function twoFactorOutstanding(
  client: SupabaseClient,
  req: NextRequest,
  userId: string,
): Promise<boolean> {
  // TOTP: if the account has a verified factor, the session must be at AAL2.
  try {
    const { data: aal } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') return true;
  } catch {
    // AAL unavailable — fall through to the email-2FA check, same as proxy.ts.
  }

  // Email-OTP: a valid signed cookie (set by /api/auth/2fa/verify) satisfies it;
  // otherwise only block when the account actually has email-2FA enabled.
  const twofaSecret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!twofaSecret) return false;
  const { verifyTwofaCookie, TWOFA_COOKIE_NAME } = await import('@/lib/auth/twofa-cookie');
  const cookieValue = req.cookies.get(TWOFA_COOKIE_NAME)?.value;
  if (verifyTwofaCookie(cookieValue, userId, twofaSecret)) return false;
  try {
    const { data: prof } = await client
      .from('user_profiles')
      .select('two_factor_email_enabled')
      .eq('user_id', userId)
      .maybeSingle();
    return Boolean(prof?.two_factor_email_enabled);
  } catch {
    return false; // profile lookup failure — don't lock the user out over an unrelated error
  }
}

/**
 * Resolve the authenticated user for a memory request. NEVER trust a userId from
 * the request body/query — derive it here from the Supabase cookie session or a
 * Lucy API key. Returns the user id and a client to use for that user's data.
 */
export async function resolveMemoryAuth(req: NextRequest): Promise<MemoryAuth> {
  // 1) Browser cookie session (same-origin fetches carry the @supabase/ssr cookies)
  const su = await resolveSessionUser(req);
  if (su) {
    const { userId, email, client } = su;
    if (await emailVerificationOutstanding(client, userId)) {
      return { userId: null, email: null, client: null, emailVerificationRequired: true };
    }
    if (await twoFactorOutstanding(client, req, userId)) {
      return { userId: null, email: null, client: null, twoFactorRequired: true };
    }
    return { userId, email, client };
  }

  // 2) Lucy API key (external integrations, e.g. Contractors Room)
  const apiUserId = await validateApiKey(req.headers.get('authorization'));
  if (apiUserId) {
    const url = (process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
    const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && svcKey) {
      const svc = createClient(url, svcKey, { db: { schema: 'lucy' } });
      return { userId: apiUserId, email: null, client: svc };
    }
  }

  return UNAUTH;
}
