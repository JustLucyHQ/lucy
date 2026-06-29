'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Mail, Lock } from 'lucide-react';
import { LucyMark } from '@/components/brand/LucyMark';
import { useAuth } from '@/lib/supabase/auth';
import { getSupabaseClient } from '@/lib/supabase/client';

// lucide-react 1.x removed brand icons; inline Google "G" mark instead
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81z" />
    </svg>
  );
}

export default function LoginPage() {
  const { signIn, signInWithGoogle, authEnabled } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  if (!authEnabled) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="flex justify-center">
            <LucyMark className="w-14 h-14" />

          </div>
          <h1 className="text-2xl font-bold text-white">Lucy</h1>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
            <p className="text-gray-300 text-sm">
              Auth requires Supabase. Running in standalone mode.
            </p>
            <Link
              href="/chat"
              className="block w-full py-2.5 px-4 rounded-lg bg-lucy-600 hover:bg-lucy-500 text-white text-sm font-medium transition-colors text-center"
            >
              Go to Chat
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: authError } = await signIn(email, password);
    setLoading(false);
    if (authError) {
      setError(authError);
    } else {
      router.refresh();
      // 2FA gate: check for TOTP factor or email 2FA preference
      const sb = getSupabaseClient();
      if (sb) {
        const { data: u } = await sb.auth.getUser();
        const factors = await sb.auth.mfa.listFactors();
        const hasTotp = (factors.data?.totp?.length ?? 0) > 0;
        let emailTwofa = false;
        if (u.user?.id) {
          const { data: prof } = await sb
            .from('user_profiles')
            .select('two_factor_email_enabled')
            .eq('user_id', u.user.id)
            .maybeSingle();
          emailTwofa = Boolean(prof?.two_factor_email_enabled);
        }
        if (hasTotp) { router.push('/auth/two-factor-challenge'); return; }
        if (emailTwofa) { router.push('/auth/2fa'); return; }
      }
      router.push('/chat');
    }
  };

  const handleGoogle = async () => {
    setError(null);
    setGoogleLoading(true);
    const { error: authError } = await signInWithGoogle();
    setGoogleLoading(false);
    if (authError) {
      setError(authError);
    }
    // On success the browser is redirected by Supabase OAuth flow
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="max-w-md w-full space-y-8">
        {/* Logo */}
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <LucyMark className="w-14 h-14" />

          </div>
          <h1 className="text-3xl font-bold text-white">Welcome back</h1>
          <p className="text-gray-400 text-sm">Sign in to your Lucy account</p>
        </div>

        {/* Card */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 space-y-6">
          {/* Google OAuth */}
          <button
            type="button"
            onClick={handleGoogle}
            disabled={googleLoading}
            className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-lg border border-gray-700 bg-gray-800 hover:bg-gray-750 text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            <GoogleIcon className="w-4 h-4" />
            {googleLoading ? 'Redirecting...' : 'Sign in with Google'}
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-800" />
            </div>
            <div className="relative flex justify-center text-xs text-gray-600">
              <span className="px-2 bg-gray-900">or continue with email</span>
            </div>
          </div>

          {/* Email / password form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="text-sm text-red-400 bg-red-950/50 border border-red-900 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <div className="space-y-1">
              <label htmlFor="email" className="text-xs font-medium text-gray-400">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-3 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-lucy-500 focus:ring-1 focus:ring-lucy-500"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="password" className="text-xs font-medium text-gray-400">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-3 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-lucy-500 focus:ring-1 focus:ring-lucy-500"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Link
                href="/auth/forgot-password"
                className="text-xs text-lucy-400 hover:text-lucy-300 transition-colors"
              >
                Forgot password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-lg bg-lucy-600 hover:bg-lucy-500 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-gray-500">
          Don&apos;t have an account?{' '}
          <Link href="/auth/signup" className="text-lucy-400 hover:text-lucy-300 transition-colors">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
