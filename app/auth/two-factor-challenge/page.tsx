'use client';
import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSupabaseClient } from '@/lib/supabase/client';
import { set2faPassed } from '@/lib/auth/twofa-session';

function Challenge() {
  const router = useRouter();
  const redirect = useSearchParams().get('redirect') || '/chat';
  const sb = getSupabaseClient();
  const [code, setCode] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const verify = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null);
    if (!sb) return;
    const factors = await sb.auth.mfa.listFactors();
    const totp = factors.data?.totp?.[0];
    if (!totp) { router.push(redirect); return; }
    const challenge = await sb.auth.mfa.challenge({ factorId: totp.id });
    if (challenge.error) { setError(challenge.error.message); return; }
    const { error } = await sb.auth.mfa.verify({ factorId: totp.id, challengeId: challenge.data.id, code });
    if (error) {
      const n = attempts + 1; setAttempts(n);
      if (n >= 5) { await sb.auth.signOut(); router.push('/auth/account-locked'); return; }
      setError(`Invalid code. ${5 - n} attempts left.`); return;
    }
    const { data } = await sb.auth.getUser();
    if (data.user?.id) set2faPassed(data.user.id);
    router.push(redirect);
  };

  return (
    <form onSubmit={verify} className="space-y-3 w-full max-w-sm">
      <h1 className="text-lg font-semibold text-white">Two-factor authentication</h1>
      <p className="text-xs text-gray-400">Enter the 6-digit code from your authenticator app.</p>
      <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6} placeholder="123456"
        className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-2 text-gray-200 tracking-widest" />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button className="w-full bg-lucy-600 hover:bg-lucy-500 text-white rounded px-3 py-2 text-sm">Verify</button>
    </form>
  );
}

export default function Page() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 p-4">
      <Suspense fallback={null}><Challenge /></Suspense>
    </div>
  );
}
