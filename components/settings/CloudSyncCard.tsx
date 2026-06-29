'use client';

import { useEffect, useState } from 'react';
import { Cloud, ExternalLink, Loader2, CheckCircle, AlertTriangle } from 'lucide-react';
import { useStorage } from '@/lib/storage/provider';
import { buildLocalBundle, bundleCounts } from '@/lib/sync/bundle';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';

const CLOUD_URL = 'https://justlucy.ai';
const KEY_STORE = 'lucy.sync.key';
const LAST_STORE = 'lucy.sync.last';

type Status = 'idle' | 'syncing' | 'done' | 'error';

interface PushResult {
  conversations: number;
  messages: number;
  providerKeys: number;
}

/**
 * Cloud Sync (standalone/desktop only). Pushes local conversations, messages,
 * and preferences to the user's justlucy.ai account using a Lucy API key.
 * One-way and re-runnable — a repeat push updates in place, never duplicates.
 */
export function CloudSyncCard() {
  const adapter = useStorage();
  const [apiKey, setApiKey] = useState('');
  const [includeKeys, setIncludeKeys] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState<PushResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);

  // Hydrate persisted key + last-sync after mount. Deferred to a microtask so
  // the setState isn't synchronous in the effect body (and stays SSR-safe — the
  // first render shows empty, then the stored values populate on the client).
  useEffect(() => {
    let key = '';
    let last: string | null = null;
    try {
      key = localStorage.getItem(KEY_STORE) ?? '';
      last = localStorage.getItem(LAST_STORE);
    } catch {
      /* ignore */
    }
    queueMicrotask(() => {
      setApiKey(key);
      setLastSync(last);
    });
  }, []);

  const persistKey = (value: string) => {
    setApiKey(value);
    try {
      if (value) localStorage.setItem(KEY_STORE, value);
      else localStorage.removeItem(KEY_STORE);
    } catch {
      /* ignore */
    }
  };

  const push = async () => {
    if (!apiKey.trim()) {
      setStatus('error');
      setError('Paste a Lucy API key first.');
      return;
    }
    setStatus('syncing');
    setError(null);
    setResult(null);
    try {
      const bundle = await buildLocalBundle(adapter, { includeProviderKeys: includeKeys });
      const counts = bundleCounts(bundle);
      if (counts.conversations === 0) {
        setStatus('error');
        setError('No local conversations to sync yet.');
        return;
      }
      const res = await fetch(`${CLOUD_URL}/api/sync/push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey.trim()}`,
        },
        body: JSON.stringify(bundle),
      });
      const data = (await res.json().catch(() => null)) as
        | (PushResult & { ok: boolean; error?: string })
        | null;
      if (!res.ok || !data?.ok) {
        setStatus('error');
        setError(
          res.status === 401
            ? 'That API key was rejected. Create a fresh one at justlucy.ai → Settings → API Access.'
            : data?.error || `Sync failed (HTTP ${res.status}).`
        );
        return;
      }
      setResult({
        conversations: data.conversations,
        messages: data.messages,
        providerKeys: data.providerKeys,
      });
      setStatus('done');
      const now = new Date().toISOString();
      setLastSync(now);
      try {
        localStorage.setItem(LAST_STORE, now);
      } catch {
        /* ignore */
      }
    } catch {
      setStatus('error');
      setError(`Could not reach ${CLOUD_URL}. Check your connection and that the cloud app is live.`);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Cloud className="w-4 h-4 text-lucy-400" /> Cloud Sync
        </CardTitle>
        <CardDescription>
          Push your local chats and settings to your justlucy.ai account. One-way and repeatable —
          re-syncing updates in place, it never duplicates.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-t2">Lucy API key</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => persistKey(e.target.value)}
            placeholder="lucy_k_…"
            className="w-full bg-raised border border-edge-strong rounded px-3 py-2 text-sm text-t1 placeholder-t3 focus:outline-none focus:border-lucy-500"
          />
          <a
            href={`${CLOUD_URL}/settings/api-access`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-lucy-400 hover:text-lucy-300"
          >
            Create a key at justlucy.ai <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        <label className="flex items-center gap-2 text-xs text-t2 cursor-pointer">
          <input
            type="checkbox"
            checked={includeKeys}
            onChange={(e) => setIncludeKeys(e.target.checked)}
            className="accent-lucy-500"
          />
          Also sync my provider API keys
        </label>

        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            size="sm"
            onClick={push}
            disabled={status === 'syncing'}
            icon={status === 'syncing' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Cloud className="w-4 h-4" />}
          >
            {status === 'syncing' ? 'Syncing…' : 'Push to cloud'}
          </Button>
          {lastSync && status !== 'syncing' && (
            <span className="text-xs text-t3">Last synced {new Date(lastSync).toLocaleString()}</span>
          )}
        </div>

        {status === 'done' && result && (
          <div className="flex items-start gap-1.5 text-xs text-green-400">
            <CheckCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>
              Synced {result.conversations} chat{result.conversations !== 1 ? 's' : ''} ·{' '}
              {result.messages} message{result.messages !== 1 ? 's' : ''}
              {result.providerKeys > 0 ? ` · ${result.providerKeys} key${result.providerKeys !== 1 ? 's' : ''}` : ''}.
              Open justlucy.ai to see them.
            </span>
          </div>
        )}
        {status === 'error' && error && (
          <div className="flex items-start gap-1.5 text-xs text-red-400">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
