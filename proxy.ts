import { NextRequest, NextResponse } from 'next/server';
import { SUPABASE_COOKIE_NAME } from '@/lib/supabase/cookie';

/**
 * Route protection middleware.
 *
 * - When Supabase is configured (authEnabled), protect /chat, /workflows,
 *   /settings routes.  Unauthenticated users are redirected to /auth/login.
 * - In standalone mode (no Supabase env vars) all routes are public.
 */

// Paths that never require auth
const PUBLIC_PREFIXES = [
  '/auth/',
  '/onboarding',
  '/api/',
  '/embed',
  '/_next/',
  '/favicon',
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function proxy(request: NextRequest) {
  const supabaseUrl = (process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const authEnabled = Boolean(supabaseUrl && supabaseKey);

  // Standalone mode — no marketing or sign-up audience. Send the root straight to
  // onboarding (which itself routes already-set-up users on to chat); everything
  // else is public. The landing page is only for the connected public web.
  if (!authEnabled) {
    if (request.nextUrl.pathname === '/') {
      return NextResponse.redirect(new URL('/onboarding', request.url));
    }
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  // Always allow public paths
  if (isPublicPath(pathname) || pathname === '/') {
    return NextResponse.next();
  }

  // Only protect app routes
  const protectedPrefixes = ['/chat', '/workflows', '/settings', '/account', '/connectors', '/widgets', '/personas', '/admin'];
  const isProtected = protectedPrefixes.some((p) => pathname.startsWith(p));

  if (!isProtected) {
    return NextResponse.next();
  }

  try {
    const { createServerClient } = await import('@supabase/ssr');

    const response = NextResponse.next();

    const supabase = createServerClient(supabaseUrl!, supabaseKey!, {
      db: { schema: 'lucy' },
      cookieOptions: { name: SUPABASE_COOKIE_NAME },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    });

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      const loginUrl = new URL('/auth/login', request.url);
      loginUrl.searchParams.set('redirectTo', pathname);
      return NextResponse.redirect(loginUrl);
    }

    // ── Server-side 2FA enforcement ──────────────────────────────────────
    // TOTP: when the user has a verified TOTP factor, the Supabase session
    // must be at AAL2 (set by mfa.verify). A password-only session is AAL1.
    try {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
        return NextResponse.redirect(new URL('/auth/two-factor-challenge', request.url));
      }
    } catch {
      // AAL unavailable — fall through to email-2FA check
    }

    // Email-OTP: enforced via the signed cookie set by /api/auth/2fa/verify.
    // Only query the profile when the cookie is absent or invalid.
    const twofaSecret = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (twofaSecret) {
      const { verifyTwofaCookie, TWOFA_COOKIE_NAME } = await import('@/lib/auth/twofa-cookie');
      const cookieValue = request.cookies.get(TWOFA_COOKIE_NAME)?.value;
      if (!verifyTwofaCookie(cookieValue, session.user.id, twofaSecret)) {
        const { data: prof } = await supabase
          .from('user_profiles')
          .select('two_factor_email_enabled')
          .eq('user_id', session.user.id)
          .maybeSingle();
        if (prof?.two_factor_email_enabled) {
          return NextResponse.redirect(new URL('/auth/2fa', request.url));
        }
      }
    }

    return response;
  } catch {
    // If anything goes wrong, fail open to avoid blocking the app
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static files
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
