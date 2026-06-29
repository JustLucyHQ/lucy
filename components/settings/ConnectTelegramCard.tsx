'use client';

import { useState } from 'react';
import { Send } from 'lucide-react';

/**
 * Per-user "Connect Telegram" card (linked mode). Generates a short-lived code
 * the user sends to the bot as `/link <code>` to bind their account.
 */
export function ConnectTelegramCard() {
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const generate = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/channels/telegram/link-code', { method: 'POST' });
      const d = await res.json();
      if (!res.ok) setErr(d.error ?? 'Failed to generate a code');
      else setCode(d.code as string);
    } catch {
      setErr('Failed to generate a code');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 rounded-theme bg-raised border border-edge-strong space-y-3">
      <div className="flex items-center gap-2">
        <Send className="w-4 h-4 text-lucy-400" />
        <span className="text-sm font-medium text-t1">Connect Telegram</span>
      </div>
      <p className="text-xs text-t3">
        If an admin enabled per-user Telegram, link your account: generate a code and send it to the
        bot as <code>/link CODE</code>. The code expires in 10 minutes.
      </p>
      {code ? (
        <div className="text-sm text-t1">
          Send this to the bot:{' '}
          <code className="px-1.5 py-0.5 rounded bg-bg border border-edge-strong text-lucy-300">/link {code}</code>
        </div>
      ) : (
        <button
          onClick={generate}
          disabled={busy}
          className="text-xs px-3 py-1.5 rounded-theme bg-lucy-600 hover:bg-lucy-500 text-white disabled:opacity-50"
        >
          {busy ? 'Generating…' : 'Generate link code'}
        </button>
      )}
      {err && <div className="text-xs text-red-400">{err}</div>}
    </div>
  );
}
