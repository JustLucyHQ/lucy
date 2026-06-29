'use client';

import { useEffect, useState } from 'react';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase/client';
import { useMemoryStore } from '@/lib/store/memory';

interface MemorySettings {
  enabled: boolean;
}

interface Usage {
  memories: number;
  entities: number;
  bytes: number;
}

export function MemoryPanel() {
  // Env vars are inlined at build time, so this is stable across SSR/CSR.
  return isSupabaseEnabled() ? <ConnectedMemoryPanel /> : <LocalMemoryPanel />;
}

// ── Connected (SaaS) — user controls only ──────────────────────────────────────

function ConnectedMemoryPanel() {
  const [settings, setSettings] = useState<MemorySettings | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const setEnabledGate = useMemoryStore((s) => s.setEnabled);
  const incognito = useMemoryStore((s) => s.incognito);
  const setIncognito = useMemoryStore((s) => s.setIncognito);

  useEffect(() => {
    fetch('/api/memory/settings')
      .then((r) => r.json())
      .then((s: MemorySettings) => {
        setSettings(s);
        setEnabledGate(Boolean(s?.enabled));
      })
      .catch(() => {});

    (async () => {
      try {
        const client = getSupabaseClient();
        if (!client) return;
        const { data } = await client.auth.getUser();
        if (!data.user?.id) return;
        const res = await fetch(`/api/memory/list?userId=${data.user.id}`);
        const json = await res.json();
        setUsage(json.usage ?? null);
      } catch {
        /* ignore */
      }
    })();
  }, [setEnabledGate]);

  async function update(patch: Partial<MemorySettings>) {
    setSettings((s) => (s ? { ...s, ...patch } : s));
    if (patch.enabled !== undefined) setEnabledGate(patch.enabled);
    await fetch('/api/memory/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }).catch(() => {});
  }

  if (!settings) {
    return (
      <p className="text-xs text-gray-500 p-3 rounded-lg bg-gray-900 border border-gray-800">
        Memory unavailable (no connected backend).
      </p>
    );
  }

  return (
    <div className="space-y-4 p-4 rounded-lg bg-gray-900 border border-gray-800">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-white">Memory</div>
          <div className="text-xs text-gray-500">
            Lucy remembers facts, preferences, and context across conversations.
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-300">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) => update({ enabled: e.target.checked })}
          />
          <span>{settings.enabled ? 'On' : 'Off'}</span>
        </label>
      </div>

      <label className="flex items-center gap-2 text-xs text-gray-400">
        <input type="checkbox" checked={incognito} onChange={(e) => setIncognito(e.target.checked)} />
        <span>Incognito this session (don&apos;t capture new memories)</span>
      </label>

      <div className="text-sm border-t border-gray-800 pt-3">
        <div className="text-xs text-gray-500 mb-1">Storage usage</div>
        {usage ? (
          <div className="text-gray-300">
            {usage.memories} memories · {usage.entities} entities · {(usage.bytes / 1024).toFixed(1)} KB (live)
          </div>
        ) : (
          <div className="text-gray-600">—</div>
        )}
      </div>
    </div>
  );
}

// ── Standalone (local) — browser-only, persisted toggle ────────────────────────

function LocalMemoryPanel() {
  const localEnabled = useMemoryStore((s) => s.localEnabled);
  const setLocalEnabled = useMemoryStore((s) => s.setLocalEnabled);
  const incognito = useMemoryStore((s) => s.incognito);
  const setIncognito = useMemoryStore((s) => s.setIncognito);
  const [usage, setUsage] = useState<Usage | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { createMemoryStore } = await import('@/lib/memory');
        const store = createMemoryStore({ client: null });
        const u = await store.usage({ userId: null, projectId: null });
        setUsage(u);
      } catch {
        /* ignore */
      }
    })();
  }, [localEnabled, incognito]);

  return (
    <div className="space-y-4 p-4 rounded-lg bg-gray-900 border border-gray-800">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-white">Memory (local)</div>
          <div className="text-xs text-gray-500">
            Stored only in this browser. Keyword recall here; semantic search is available in connected mode.
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-300">
          <input
            type="checkbox"
            checked={localEnabled}
            onChange={(e) => setLocalEnabled(e.target.checked)}
          />
          <span>{localEnabled ? 'On' : 'Off'}</span>
        </label>
      </div>

      <label className="flex items-center gap-2 text-xs text-gray-400">
        <input type="checkbox" checked={incognito} onChange={(e) => setIncognito(e.target.checked)} />
        <span>Incognito this session (don&apos;t capture new memories)</span>
      </label>

      <div className="text-sm border-t border-gray-800 pt-3">
        <div className="text-xs text-gray-500 mb-1">Storage usage</div>
        {usage ? (
          <div className="text-gray-300">
            {usage.memories} memories · {usage.entities} entities · {(usage.bytes / 1024).toFixed(1)} KB (local)
          </div>
        ) : (
          <div className="text-gray-600">—</div>
        )}
      </div>
    </div>
  );
}
