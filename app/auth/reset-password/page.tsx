'use client';
import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { LucyMark } from '@/components/brand/LucyMark';

function ResetForm() {
  const router = useRouter();
  const email = useSearchParams().get('email') ?? '';
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 12) return setError('Password must be at least 12 characters.');
    if (password !== confirm) return setError('Passwords do not match.');
    setLoading(true);
    const res = await fetch('/api/auth/reset/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code, password }),
    });
    const json = await res.json();
    setLoading(false);
    if (json.ok) {
      router.push('/auth/login');
      return;
    }
    setError(
      (
        {
          no_code: 'No active code — request a new one.',
          expired: 'Code expired — request a new one.',
          too_many: 'Too many attempts — request a new one.',
          mismatch: 'Invalid code.',
        } as Record<string, string>
      )[json.reason as string] ?? 'Failed.'
    );
  };

  return (
    <div className="max-w-md w-full space-y-8">
      <div className="text-center space-y-3">
        <div className="flex justify-center">
          <LucyMark className="w-14 h-14 rounded-2xl" />
        </div>
        <h1 className="text-3xl font-bold text-white">Reset password</h1>
        <p className="text-gray-400 text-sm">
          Enter the 6-digit code sent to{' '}
          <span className="text-white">{email || 'your email'}</span> and a new password.
        </p>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-8">
        <form onSubmit={submit} className="space-y-4">
          {error && (
            <div className="text-sm text-red-400 bg-red-950/50 border border-red-900 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div className="space-y-1">
            <label htmlFor="code" className="text-xs font-medium text-gray-400">
              Verification code
            </label>
            <input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              maxLength={6}
              placeholder="123456"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-100 placeholder-gray-600 tracking-widest focus:outline-none focus:border-lucy-500 focus:ring-1 focus:ring-lucy-500"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="password" className="text-xs font-medium text-gray-400">
              New password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 12 characters"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-lucy-500 focus:ring-1 focus:ring-lucy-500"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="confirm" className="text-xs font-medium text-gray-400">
              Confirm password
            </label>
            <input
              id="confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repeat your password"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-lucy-500 focus:ring-1 focus:ring-lucy-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-lg bg-lucy-600 hover:bg-lucy-500 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Resetting…' : 'Reset password'}
          </button>
        </form>
      </div>

      <p className="text-center text-sm text-gray-500">
        Need a new code?{' '}
        <Link href="/auth/forgot-password" className="text-lucy-400 hover:text-lucy-300 transition-colors">
          Request again
        </Link>
      </p>
    </div>
  );
}

export default function Page() {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <Suspense fallback={null}>
        <ResetForm />
      </Suspense>
    </div>
  );
}
