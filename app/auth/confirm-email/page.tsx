'use client';
/**
 * Confirm your e-mail — Lucy's own code-based sign-up confirmation (lib/email/codes.ts, purpose 'signup').
 * Opening the page sends a code only when none is out yet (the server decides); "Resend code" sends a new one
 * after a short cooldown; any of the last few codes works. "Sign in as someone else" leaves this screen.
 */
import { useEffect, useRef, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MailCheck } from 'lucide-react';
import { LucyMark } from '@/components/brand/LucyMark';

const REASON: Record<string, string> = {
  expired: 'That code has expired — press “Resend code” for a new one.',
  too_many: 'Too many wrong tries — press “Resend code” for a new one.',
  no_code: 'There is no open code — press “Resend code”.',
  mismatch: 'That code doesn’t match. Use the newest e-mail, or press “Resend code”.',
};

function Confirm() {
  const router = useRouter();
  const redirect = useSearchParams().get('redirect') || '/chat';
  const [email, setEmail] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const asked = useRef(false);

  const request = async (resend: boolean) => {
    const res = await fetch('/api/auth/signup/request', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resend }),
    });
    return res.json().catch(() => ({ ok: false }));
  };

  useEffect(() => {
    if (asked.current) return; // React may run this twice; the server de-duplicates too
    asked.current = true;
    request(false).then((j) => { if (j?.email) setEmail(j.email); });
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null); setNote(null); setLoading(true);
    const res = await fetch('/api/auth/signup/confirm', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }),
    });
    const json = await res.json().catch(() => ({ ok: false }));
    setLoading(false);
    if (json.ok) { router.push(redirect); return; }
    setError(REASON[json.reason as string] ?? REASON.mismatch);
  };

  const resend = async () => {
    setError(null); setNote(null); setResending(true);
    const j = await request(true);
    setResending(false);
    if (j?.email) setEmail(j.email);
    if (j?.sent) setNote('A new code is on its way.');
    else if (j?.retryInSec) setNote(`A code was just sent — you can ask for another in ${j.retryInSec} s.`);
    else setNote('A code was just sent — check your inbox (and spam).');
  };

  return (
    <div className="max-w-md w-full space-y-8">
      <div className="text-center space-y-3">
        <div className="flex justify-center"><LucyMark className="w-14 h-14" /></div>
        <h1 className="text-3xl font-bold text-white">Confirm your email</h1>
        <p className="text-gray-400 text-sm">
          We sent a 6-digit code to {email ? <span className="text-gray-200 font-medium">{email}</span> : 'your e-mail address'}.
        </p>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 space-y-5">
        <form onSubmit={submit} className="space-y-4">
          <label htmlFor="code" className="block text-sm font-medium text-gray-300">Code</label>
          <input
            id="code" value={code} autoFocus autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]*" maxLength={6} placeholder="123456"
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            className="w-full py-2.5 px-4 rounded-lg bg-gray-800 border border-gray-700 text-white text-lg tracking-[0.4em] placeholder-gray-600 focus:outline-none focus:border-lucy-500 focus:ring-1 focus:ring-lucy-500 transition-colors"
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          {note && <p className="text-sm text-emerald-400 inline-flex items-center gap-1.5"><MailCheck className="w-4 h-4" /> {note}</p>}
          <button
            type="submit" disabled={loading || code.length !== 6}
            className="w-full py-2.5 px-4 rounded-lg bg-lucy-600 hover:bg-lucy-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
          >
            {loading ? 'Confirming…' : 'Confirm'}
          </button>
        </form>
        <div className="flex items-center justify-between text-sm">
          <button type="button" onClick={resend} disabled={resending} className="text-lucy-400 hover:text-lucy-300 disabled:opacity-50">
            {resending ? 'Sending…' : 'Resend code'}
          </button>
          <a href="/auth/logout" className="text-gray-400 hover:text-gray-200">Sign in as someone else</a>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <Suspense fallback={null}><Confirm /></Suspense>
    </div>
  );
}
