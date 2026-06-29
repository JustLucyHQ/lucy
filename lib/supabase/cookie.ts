/**
 * Fixed Supabase auth-cookie name.
 *
 * Pinned so the browser client (built from NEXT_PUBLIC_SUPABASE_URL) and the
 * server clients (built from SUPABASE_INTERNAL_URL when self-hosting behind a
 * proxy) agree on the cookie name. Without this, @supabase/ssr derives the name
 * from each client's URL hostname — so the browser writes `sb-<public>-auth-token`
 * while the middleware reads `sb-<internal>-auth-token`, never finds the session,
 * and bounces every signed-in request back to /auth/login.
 *
 * Must be identical across every createBrowserClient / createServerClient call.
 */
export const SUPABASE_COOKIE_NAME = 'sb-justlucy-auth-token';
