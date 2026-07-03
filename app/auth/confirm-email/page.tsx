'use client';
import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function Confirm() {
  const router = useRouter();
  const redirect = useSearchParams().get('redirect') || '/chat';
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { fetch('/api/auth/signup/request', { method: 'POST' }).catch(() => {}); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null); setLoading(true);
    const res = await fetch('/api/auth/signup/confirm', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }),
    });
    const json = await res.json(); setLoading(false);
    if (json.ok) { router.push(redirect); return; }
    setError('Invalid or expired code.');
  };

  return (
    <form onSubmit={submit} className="space-y-3 w-full max-w-sm">
      <h1 className="text-lg font-semibold text-white">Confirm your email</h1>
      <p className="text-xs text-gray-400">We emailed you a 6-digit code to activate your account.</p>
      <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6} placeholder="123456"
        className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-2 text-gray-200 tracking-widest" />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button disabled={loading} className="w-full bg-lucy-600 hover:bg-lucy-500 disabled:opacity-50 text-white rounded px-3 py-2 text-sm">
        {loading ? 'Confirming…' : 'Confirm'}
      </button>
      <button type="button" onClick={() => fetch('/api/auth/signup/request', { method: 'POST' })} className="text-xs text-gray-500 hover:text-gray-300">Resend code</button>
    </form>
  );
}

export default function Page() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 p-4">
      <Suspense fallback={null}><Confirm /></Suspense>
    </div>
  );
}
