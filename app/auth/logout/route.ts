// GET /auth/logout — "Sign in as someone else": sign out from anywhere, including screens a half-signed-in
// session gets stuck on (confirm e-mail, two-step sign-in, account locked). Same idea as Bizinly's
// @bizinly/account logout route.
import { NextRequest, NextResponse } from 'next/server';
import { SUPABASE_COOKIE_NAME } from '@/lib/supabase/cookie';
import { TWOFA_COOKIE_NAME } from '@/lib/auth/twofa-cookie';

export const dynamic = 'force-dynamic';

/** The address the browser used. Behind nginx `req.url` is the internal bind address (127.0.0.1:3001), so a
 * redirect built from it would send the browser somewhere unreachable. Only ever a path on that same site. */
function browserOrigin(req: NextRequest): string {
  const url = new URL(req.url);
  const host = (req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? url.host).split(',')[0].trim();
  const proto = (req.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '')).split(',')[0].trim();
  return `${proto}://${host}`;
}

export async function GET(req: NextRequest) {
  const res = NextResponse.redirect(new URL('/auth/login', browserOrigin(req)));
  res.headers.set('Cache-Control', 'no-store');

  const url = process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && anon) {
    try {
      const { createServerClient } = await import('@supabase/ssr');
      const sb = createServerClient(url, anon, {
        cookieOptions: { name: SUPABASE_COOKIE_NAME },
        cookies: {
          getAll: () => req.cookies.getAll(),
          setAll: (list) => list.forEach(({ name, value, options }) => res.cookies.set(name, value, options)),
        },
      });
      await sb.auth.signOut(); // revokes the refresh token, not just the cookie
    } catch {
      /* signing out must never fail — the cookies are cleared below either way */
    }
  }
  const kill = { path: '/', maxAge: 0, expires: new Date(0) };
  for (const c of req.cookies.getAll()) {
    if (c.name.startsWith(SUPABASE_COOKIE_NAME) || c.name === TWOFA_COOKIE_NAME || c.name === 'lucy_tenant') res.cookies.set(c.name, '', kill);
  }
  return res;
}
