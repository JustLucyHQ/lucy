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
}

const UNAUTH: MemoryAuth = { userId: null, email: null, client: null };

/**
 * Resolve the authenticated user for a memory request. NEVER trust a userId from
 * the request body/query — derive it here from the Supabase cookie session or a
 * Lucy API key. Returns the user id and a client to use for that user's data.
 */
export async function resolveMemoryAuth(req: NextRequest): Promise<MemoryAuth> {
  const url = (process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // 1) Browser cookie session (same-origin fetches carry the @supabase/ssr cookies)
  if (url && anon) {
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
      // Fail closed — fall through to API-key auth — but log for debuggability.
      console.warn(
        '[memory/auth] session auth failed:',
        error instanceof Error ? error.message : 'unknown error'
      );
    }
  }

  // 2) Lucy API key (external integrations, e.g. Contractors Room)
  const apiUserId = await validateApiKey(req.headers.get('authorization'));
  if (apiUserId) {
    const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && svcKey) {
      const svc = createClient(url, svcKey, { db: { schema: 'lucy' } });
      return { userId: apiUserId, email: null, client: svc };
    }
  }

  return UNAUTH;
}
