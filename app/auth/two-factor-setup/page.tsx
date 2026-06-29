'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseClient } from '@/lib/supabase/client';

export default function Page() {
  const router = useRouter();
  const sb = getSupabaseClient();
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState('');
  const [factorId, setFactorId] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!sb) return;
      const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Authenticator App' });
      if (error) { setError(error.message); return; }
      setQr(data.totp.qr_code); setSecret(data.totp.secret); setFactorId(data.id);
    })();
  }, [sb]);

  const verify = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null);
    if (!sb) return;
    const challenge = await sb.auth.mfa.challenge({ factorId });
    if (challenge.error) { setError(challenge.error.message); return; }
    const { error } = await sb.auth.mfa.verify({ factorId, challengeId: challenge.data.id, code });
    if (error) { setError(error.message); return; }
    router.push('/account/security');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 p-4">
      <form onSubmit={verify} className="space-y-4 w-full max-w-sm">
        <h1 className="text-lg font-semibold text-white">Set up authenticator app</h1>
        <p className="text-xs text-gray-400">Scan this QR in your authenticator app, then enter the 6-digit code.</p>
        {/* eslint-disable-next-line @next/next/no-img-element -- QR is a data: URL; next/image cannot optimize it */}
        {qr && <img src={qr} alt="2FA QR code" className="w-44 h-44 bg-white rounded p-2 mx-auto" />}
        {secret && <p className="text-[11px] text-gray-500 break-all">Or enter manually: <span className="text-gray-300">{secret}</span></p>}
        <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6} placeholder="123456"
          className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-2 text-gray-200 tracking-widest" />
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button className="w-full bg-lucy-600 hover:bg-lucy-500 text-white rounded px-3 py-2 text-sm">Enable 2FA</button>
      </form>
    </div>
  );
}
