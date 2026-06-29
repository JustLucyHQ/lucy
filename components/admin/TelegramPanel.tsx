'use client';

import { useEffect, useState } from 'react';
import { Send, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

interface RoleUser {
  id: string;
  email: string;
}

interface TelegramStatus {
  hasBotToken: boolean;
  mode: 'shared' | 'linked';
  allowlist: number[];
  sharedOwnerUserId: string | null;
  hasSharedKey: boolean;
  defaultProvider: string;
  defaultModel: string;
  webhookRegistered: boolean;
  enabled: boolean;
}

export function TelegramPanel() {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [users, setUsers] = useState<RoleUser[]>([]);
  const [botToken, setBotToken] = useState('');
  const [mode, setMode] = useState<'shared' | 'linked'>('shared');
  const [allowlist, setAllowlist] = useState('');
  const [owner, setOwner] = useState('');
  const [provider, setProvider] = useState('anthropic');
  const [model, setModel] = useState('claude-sonnet-4-6');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = () =>
    fetch('/api/admin/telegram')
      .then((r) => r.json())
      .then((d: TelegramStatus) => {
        setStatus(d);
        setMode(d.mode);
        setAllowlist((d.allowlist ?? []).join(', '));
        setOwner(d.sharedOwnerUserId ?? '');
        setProvider(d.defaultProvider ?? 'anthropic');
        setModel(d.defaultModel ?? 'claude-sonnet-4-6');
      })
      .catch(() => setMsg({ ok: false, text: 'Failed to load Telegram settings' }));

  useEffect(() => {
    load();
    fetch('/api/admin/roles')
      .then((r) => r.json())
      .then((d) => setUsers(d.users ?? []))
      .catch(() => {});
  }, []);

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const body: Record<string, unknown> = {
        mode,
        allowlist: allowlist.split(',').map((s) => s.trim()).filter(Boolean).map(Number),
        defaultProvider: provider,
        defaultModel: model,
      };
      if (botToken) body.botToken = botToken;
      if (mode === 'shared' && owner) body.sharedOwnerUserId = owner;
      const res = await fetch('/api/admin/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) setMsg({ ok: false, text: d.error ?? 'Save failed' });
      else {
        setMsg({ ok: true, text: 'Saved.' });
        setBotToken('');
        await load();
      }
    } catch {
      setMsg({ ok: false, text: 'Save failed' });
    } finally {
      setBusy(false);
    }
  };

  const webhook = async (action: 'register' | 'unregister') => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/telegram?action=${action}`, { method: 'POST' });
      const d = await res.json();
      if (!res.ok) setMsg({ ok: false, text: d.error ?? `${action} failed` });
      else {
        setMsg({ ok: true, text: action === 'register' ? 'Webhook registered — bot is live.' : 'Webhook removed.' });
        await load();
      }
    } catch {
      setMsg({ ok: false, text: `${action} failed` });
    } finally {
      setBusy(false);
    }
  };

  const field = 'w-full bg-gray-800 border border-gray-700 rounded-md px-2.5 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-lucy-500';

  return (
    <div className="p-4 rounded-lg bg-gray-900 border border-gray-800 space-y-3">
      <div className="flex items-center gap-2">
        <Send className="w-4 h-4 text-lucy-400" />
        <span className="text-sm text-gray-200">Telegram bot</span>
        {status?.enabled ? (
          <span className="text-xs text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> live</span>
        ) : (
          <span className="text-xs text-gray-500">disabled</span>
        )}
      </div>

      <p className="text-xs text-gray-500">
        Create a bot with @BotFather, paste its token, choose a mode, save, then Register webhook.
        Requires connected (Supabase) mode and the <code>telegram.sql</code> migration.
      </p>

      <label className="block text-xs text-gray-400">
        Bot token {status?.hasBotToken && <span className="text-emerald-500">(set)</span>}
        <input type="password" autoComplete="off" value={botToken} onChange={(e) => setBotToken(e.target.value)}
          placeholder={status?.hasBotToken ? '•••••• (leave blank to keep)' : '123456:ABC-DEF…'} className={field} />
      </label>

      <label className="block text-xs text-gray-400">
        Mode
        <select value={mode} onChange={(e) => setMode(e.target.value as 'shared' | 'linked')} className={field}>
          <option value="shared">Shared — one bot, your keys + memory</option>
          <option value="linked">Linked — each user links their own account</option>
        </select>
      </label>

      {mode === 'shared' && (
        <>
          <label className="block text-xs text-gray-400">
            Owner account (whose keys + memory the bot uses)
            <select value={owner} onChange={(e) => setOwner(e.target.value)} className={field}>
              <option value="">— select —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.email || u.id}</option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-gray-400">
            Allowlist — Telegram user IDs, comma-separated (blank = anyone)
            <input value={allowlist} onChange={(e) => setAllowlist(e.target.value)} placeholder="111111111, 222222222" className={field} />
          </label>
        </>
      )}

      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs text-gray-400">
          Provider
          <select value={provider} onChange={(e) => setProvider(e.target.value)} className={field}>
            <option value="anthropic">Anthropic</option>
            <option value="openai">OpenAI</option>
            <option value="google">Google</option>
          </select>
        </label>
        <label className="block text-xs text-gray-400">
          Default model
          <input value={model} onChange={(e) => setModel(e.target.value)} className={field} />
        </label>
      </div>

      {msg && (
        <div className={`text-xs flex items-center gap-1.5 ${msg.ok ? 'text-emerald-400' : 'text-red-400'}`}>
          {msg.ok ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
          {msg.text}
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <button onClick={save} disabled={busy}
          className="text-xs px-3 py-1.5 rounded-md bg-lucy-600 hover:bg-lucy-500 text-white disabled:opacity-50 flex items-center gap-1.5">
          {busy && <Loader2 className="w-3 h-3 animate-spin" />} Save
        </button>
        {status?.webhookRegistered ? (
          <button onClick={() => webhook('unregister')} disabled={busy}
            className="text-xs px-3 py-1.5 rounded-md border border-gray-700 text-gray-300 hover:bg-gray-800 disabled:opacity-50">
            Unregister webhook
          </button>
        ) : (
          <button onClick={() => webhook('register')} disabled={busy || !status?.hasBotToken}
            className="text-xs px-3 py-1.5 rounded-md border border-lucy-700 text-lucy-300 hover:bg-lucy-950 disabled:opacity-50">
            Register webhook
          </button>
        )}
      </div>
    </div>
  );
}
