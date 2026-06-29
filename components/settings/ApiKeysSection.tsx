'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { CheckCircle, Loader2, Trash2, Key, Copy, Plus, Shield } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { useStorage, useStorageMode } from '@/lib/storage/provider';

interface ApiKeyRecord {
  id: string;
  key_prefix: string;
  name: string;
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;
}

export function ApiKeysSection() {
  const adapter = useStorage();
  const storageMode = useStorageMode();
  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const getSessionToken = useCallback(async (): Promise<string | null> => {
    if (storageMode !== 'supabase') return null;
    const { createBrowserClient } = await import('@supabase/ssr');
    const sb = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { db: { schema: 'lucy' } },
    );
    const { data } = await sb.auth.getSession();
    return data.session?.access_token ?? null;
  }, [storageMode]);

  const fetchKeys = useCallback(() => {
    return getSessionToken().then((token) => {
      if (!token) return;
      setLoading(true);
      return fetch('/api/keys', { headers: { Authorization: `Bearer ${token}` } })
        .then(async (res) => {
          if (res.ok) {
            const data = await res.json();
            setKeys(data.keys ?? []);
          }
        })
        .finally(() => setLoading(false));
    });
  }, [getSessionToken]);

  useEffect(() => {
    if (storageMode === 'supabase') fetchKeys();
  }, [storageMode, fetchKeys]);

  const handleCreate = async () => {
    const token = await getSessionToken();
    if (!token) return;
    setCreating(true);
    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName || 'Default' }),
      });
      if (res.ok) {
        const data = await res.json();
        setRevealedKey(data.key);
        setNewKeyName('');
        await fetchKeys();
      }
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (keyId: string) => {
    const token = await getSessionToken();
    if (!token) return;
    await fetch(`/api/keys?id=${keyId}&action=revoke`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    await fetchKeys();
  };

  const handleDelete = async (keyId: string) => {
    const token = await getSessionToken();
    if (!token) return;
    await fetch(`/api/keys?id=${keyId}&action=delete`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    await fetchKeys();
  };

  const handleCopy = () => {
    if (revealedKey) {
      navigator.clipboard.writeText(revealedKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (storageMode !== 'supabase') return null;

  return (
    <section>
      <h2 className="text-lg font-semibold text-white mb-4">API Keys</h2>
      <p className="text-xs text-gray-500 mb-4 p-3 rounded-lg bg-gray-900 border border-gray-800">
        API keys let external applications (e.g. Contractors Room) use Lucy&apos;s screening API on your behalf.
        Each key is shown once on creation and stored as a SHA-256 hash.
      </p>

      {revealedKey && (
        <div className="mb-4 p-4 rounded-xl bg-green-900/30 border border-green-800">
          <p className="text-xs text-green-400 font-medium mb-2">
            New key created. Copy it now — it will not be shown again.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-sm text-green-300 bg-gray-900 px-3 py-2 rounded-lg font-mono break-all">
              {revealedKey}
            </code>
            <button
              onClick={handleCopy}
              className="shrink-0 p-2 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
            >
              {copied ? <CheckCircle className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
          <button
            onClick={() => setRevealedKey(null)}
            className="mt-2 text-xs text-gray-500 hover:text-gray-300"
          >
            Dismiss
          </button>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Key className="w-5 h-5 text-lucy-400" />
              <div>
                <CardTitle>Manage Keys</CardTitle>
                <CardDescription>{keys.length} key{keys.length !== 1 ? 's' : ''} created</CardDescription>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="Key name (e.g. Contractors Room)"
                className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-lucy-500 focus:ring-1 focus:ring-lucy-500"
              />
              <Button
                variant="primary"
                size="sm"
                icon={<Plus className="w-4 h-4" />}
                onClick={handleCreate}
                disabled={creating}
                loading={creating}
              >
                Create Key
              </Button>
            </div>

            {loading && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
              </div>
            )}

            {!loading && keys.length > 0 && (
              <div className="rounded-lg border border-gray-800 bg-gray-900 divide-y divide-gray-800">
                {keys.map((k) => (
                  <div key={k.id} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <Shield className={`w-4 h-4 shrink-0 ${k.is_active ? 'text-green-400' : 'text-gray-600'}`} />
                      <div className="min-w-0">
                        <p className="text-sm text-gray-100 truncate">{k.name}</p>
                        <p className="text-xs text-gray-500 font-mono">{k.key_prefix}...</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {k.last_used_at && (
                        <span className="text-xs text-gray-500">
                          Used {new Date(k.last_used_at).toLocaleDateString()}
                        </span>
                      )}
                      <Badge variant={k.is_active ? 'success' : 'default'}>
                        {k.is_active ? 'Active' : 'Revoked'}
                      </Badge>
                      {k.is_active ? (
                        <Button variant="ghost" size="sm" onClick={() => handleRevoke(k.id)}>
                          Revoke
                        </Button>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(k.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
