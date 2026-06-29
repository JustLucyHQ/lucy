'use client';
import { useState } from 'react';
import { useSettingsStore } from '@/lib/store/settings';
import { useStorage, useStorageMode } from '@/lib/storage/provider';
import { useConversationsStore } from '@/lib/store/conversations';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { THEME_OPTIONS } from '@/lib/theme';
import { ConnectTelegramCard } from '@/components/settings/ConnectTelegramCard';
import { CloudSyncCard } from '@/components/settings/CloudSyncCard';

export default function Page() {
  // ---------- Preferences ----------
  const { theme, setTheme } = useSettingsStore();
  const adapter = useStorage();
  const storageMode = useStorageMode();
  const { conversations, deleteConversation } = useConversationsStore();
  const [cleared, setCleared] = useState(false);

  const handleClearHistory = async () => {
    for (const conv of conversations) {
      await deleteConversation(conv.id, adapter);
    }
    setCleared(true);
    setTimeout(() => setCleared(false), 2000);
  };

  return (
    <div className="space-y-10">
      {/* ── Preferences section ── */}
      <section className="space-y-6">
        <div>
          <h2 className="text-lg font-bold text-t1 tracking-tight">General</h2>
          <p className="text-sm text-t3 mt-0.5">Appearance and data.</p>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-medium text-t1">Appearance</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {THEME_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                onClick={() => setTheme(opt.id, adapter)}
                className={`text-left rounded-theme border p-2 transition-colors ${
                  theme === opt.id
                    ? 'border-accent ring-1 ring-accent'
                    : 'border-edge hover:border-edge-strong'
                }`}
                aria-pressed={theme === opt.id}
              >
                <ThemeSwatch id={opt.id} />
                <div className="mt-2 text-xs font-semibold text-t1">{opt.label}</div>
                <div className="text-[10px] text-t3">{opt.blurb}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="opacity-60 space-y-1">
          <h3 className="text-sm font-medium text-t1">Voice</h3>
          <p className="text-xs text-t3">Voice output &amp; input — coming soon.</p>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-medium text-t1">Data</h3>
          <Card>
            <CardHeader>
              <CardTitle>Conversation History</CardTitle>
              <CardDescription>
                {conversations.length} conversation{conversations.length !== 1 ? 's' : ''}{' '}
                {storageMode === 'supabase' ? 'stored in Supabase' : 'stored locally'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="danger"
                size="sm"
                icon={<Trash2 className="w-4 h-4" />}
                onClick={handleClearHistory}
                disabled={conversations.length === 0}
              >
                {cleared ? 'Cleared!' : 'Clear All History'}
              </Button>
            </CardContent>
          </Card>
        </div>

        {storageMode === 'local' && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-t1">Cloud</h3>
            <CloudSyncCard />
          </div>
        )}

        <div className="space-y-2">
          <h3 className="text-sm font-medium text-t1">Channels</h3>
          <ConnectTelegramCard />
        </div>
      </section>
    </div>
  );
}

/** Mini three-stripe preview of a theme's bg / surface / accent. */
function ThemeSwatch({ id }: { id: string }) {
  const palette: Record<string, [string, string, string]> = {
    luminous: ['#0c0a16', '#12101f', '#8b5cf6'],
    industrial: ['#0a0a0f', '#12121c', '#8b5cf6'],
    editorial: ['#050507', '#101014', '#8b5cf6'],
    dark: ['#030712', '#111827', '#8b5cf6'],
    light: ['#fafafc', '#f4f4f6', '#7c3aed'],
  };
  const [bg, surface, accent] = palette[id] ?? palette.dark;
  return (
    <div className="h-10 rounded-md overflow-hidden flex border border-edge">
      <div style={{ background: bg }} className="flex-1" />
      <div style={{ background: surface }} className="flex-1" />
      <div style={{ background: accent }} className="w-2" />
    </div>
  );
}
