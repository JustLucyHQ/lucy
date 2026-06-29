'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Mail } from 'lucide-react';
import { LucyMark } from '@/components/brand/LucyMark';
import { useAuth } from '@/lib/supabase/auth';

export default function ForgotPasswordPage() {
  const { authEnabled } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!authEnabled) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="flex justify-center">
            <LucyMark className="w-14 h-14 rounded-2xl" />
          </div>
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
    await fetch('/api/auth/reset/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    setLoading(false);
    router.push(`/auth/reset-password?email=${encodeURIComponent(email)}`);
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <LucyMark className="w-14 h-14 rounded-2xl" />
          </div>
          <h1 className="text-3xl font-bold text-white">Reset password</h1>
          <p className="text-gray-400 text-sm">
            Enter your email and we&apos;ll send you a reset link.
          </p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8">
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

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-lg bg-lucy-600 hover:bg-lucy-500 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Sending...' : 'Send reset link'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-gray-500">
          Remembered your password?{' '}
          <Link href="/auth/login" className="text-lucy-400 hover:text-lucy-300 transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
