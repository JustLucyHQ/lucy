'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LucyMark } from '@/components/brand/LucyMark';
import { getSupabaseClient } from '@/lib/supabase/client';

/**
 * OAuth callback — handled client-side on purpose.
 *
 * The PKCE code→session exchange must POST to Supabase. Doing it server-side
 * fails in production: the host can't reach its own public Supabase URL
 * (api.contractorsroom.com) from inside the network (NAT hairpin), so the
 * exchange hangs and the callback 502s. The browser has no such limitation and
 * already holds the code_verifier (signInWithGoogle uses the browser client),
 * so we exchange here and let createBrowserClient persist the session to
 * cookies — which the server middleware then reads on the way to /chat.
 */
export default function AuthCallbackPage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const client = getSupabaseClient();
      // Standalone build (no Supabase) never reaches this route, but be safe.
      if (!client) {
        window.location.replace('/chat');
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const oauthError = params.get('error_description') || params.get('error');

      // GoTrue's native email-confirmation/magic-link/recovery redirects deliver
      // the session as a URL FRAGMENT (#access_token=...&refresh_token=...)
      // rather than a query param. @supabase/ssr's createBrowserClient hard-codes
      // flowType: 'pkce', so its own automatic detectSessionInUrl parsing rejects
      // this format internally (throws, silently swallowed) — we have to parse
      // and apply it ourselves.
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const hashError = hashParams.get('error_description') || hashParams.get('error');
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');

      if (oauthError || hashError) {
        if (!cancelled) setError(decodeURIComponent(oauthError || hashError || ''));
        return;
      }

      try {
        if (code) {
          await client.auth.exchangeCodeForSession(code);
        } else if (accessToken && refreshToken) {
          const { error: setSessionError } = await client.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (setSessionError) throw setSessionError;
          // Clear the tokens from the URL so a refresh doesn't retry with a
          // now-already-used token pair.
          window.history.replaceState(null, '', window.location.pathname);
        }
      } catch {
        // detectSessionInUrl may have already consumed the code; fall through
        // and check for a real session before treating this as a failure.
      }

      const { data } = await client.auth.getSession();
      if (data.session) {
        window.location.replace('/chat');
      } else if (!cancelled) {
        setError('We couldn’t complete your sign-in. Please try again.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <LucyMark className="w-14 h-14" />
        </div>
        {error ? (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
            <p className="text-sm text-red-400">{error}</p>
            <Link
              href="/auth/login"
              className="block w-full py-2.5 px-4 rounded-lg bg-lucy-600 hover:bg-lucy-500 text-white text-sm font-medium transition-colors"
            >
              Back to sign in
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-center">
              <div className="w-6 h-6 border-2 border-gray-700 border-t-lucy-500 rounded-full animate-spin" />
            </div>
            <p className="text-gray-400 text-sm">Signing you in…</p>
          </div>
        )}
      </div>
    </div>
  );
}
