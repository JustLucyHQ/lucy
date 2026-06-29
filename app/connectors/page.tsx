'use client';

/**
 * Connectors / MCP Marketplace
 *
 * Browse the connector catalog, install + configure MCP servers per-user,
 * and manage installed connectors (enable/disable, approval gate, uninstall).
 *
 * Preserves the "Embed Lucy in Another App" snippet section at the bottom.
 * Keeps registerContractorsRoom() so CTR appears in both the catalog and the
 * existing integration registry.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Search } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Card, CardContent } from '@/components/ui/Card';
import { ConnectorCard } from '@/components/connectors/ConnectorCard';
import { ConnectorDetail } from '@/components/connectors/ConnectorDetail';
import { InstalledList } from '@/components/connectors/InstalledList';
import { AddCustomConnector } from '@/components/connectors/AddCustomConnector';
import { registerContractorsRoom } from '@/lib/integrations/contractors-room';
import type { CatalogServer, Installation } from '@/lib/mcp/types';

// Ensure CTR integration is registered when this module loads (side-effect preserved)
registerContractorsRoom();

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'browse' | 'installed';

type Category =
  | 'all'
  | 'dev'
  | 'productivity'
  | 'messaging'
  | 'data'
  | 'payments'
  | 'search'
  | 'local'
  | 'builtin';

const CATEGORIES: { id: Category; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'dev', label: 'Dev' },
  { id: 'productivity', label: 'Productivity' },
  { id: 'messaging', label: 'Messaging' },
  { id: 'data', label: 'Data' },
  { id: 'payments', label: 'Payments' },
  { id: 'search', label: 'Search' },
  { id: 'local', label: 'Local' },
];

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ConnectorsPage() {
  const [tab, setTab] = useState<Tab>('browse');
  const [category, setCategory] = useState<Category>('all');
  const [query, setQuery] = useState('');
  const [servers, setServers] = useState<CatalogServer[]>([]);
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [connections, setConnections] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedServer, setSelectedServer] = useState<CatalogServer | null>(null);

  // ── Fetch catalog + installations ──────────────────────────────────────────

  const fetchCatalog = useCallback(async (cat: Category, q: string) => {
    const params = new URLSearchParams();
    if (cat !== 'all') params.set('category', cat);
    if (q.trim()) params.set('q', q.trim());
    const res = await fetch(`/api/mcp/registry?${params}`, { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    setServers(data.servers ?? []);
  }, []);

  const fetchInstallations = useCallback(async () => {
    const res = await fetch('/api/mcp/installations', { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    setInstallations(data.installations ?? []);
  }, []);

  // OAuth-connected connectors (GitHub, Google, Slack, …) — tracked separately
  // from installs, so the UI must read them to show "Connected".
  const fetchConnections = useCallback(async () => {
    const res = await fetch('/api/oauth/connections', { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    setConnections(data.connections ?? []);
  }, []);

  const handleDisconnect = useCallback(
    async (slug: string) => {
      await fetch(`/api/oauth/connections?provider=${encodeURIComponent(slug)}`, { method: 'DELETE' });
      await fetchConnections();
    },
    [fetchConnections]
  );

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([fetchCatalog(category, query), fetchInstallations(), fetchConnections()]);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch catalog when category or query changes (debounced for search)
  useEffect(() => {
    const timer = setTimeout(() => { fetchCatalog(category, query); }, 200);
    return () => clearTimeout(timer);
  }, [category, query, fetchCatalog]);

  // ── Install / uninstall / patch ────────────────────────────────────────────

  const handleInstall = useCallback(
    async (config: Record<string, string>) => {
      if (!selectedServer) return;
      const res = await fetch('/api/mcp/installations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: selectedServer.slug, config }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'Install failed');
      await fetchInstallations();
      // Close detail after successful install if server has no required secrets that are unset
      setSelectedServer(null);
    },
    [selectedServer, fetchInstallations]
  );

  const handleUninstall = useCallback(
    async (slug?: string) => {
      const target = slug ?? selectedServer?.slug;
      if (!target) return;
      const res = await fetch(`/api/mcp/installations?slug=${encodeURIComponent(target)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Uninstall failed');
      await fetchInstallations();
      if (!slug) setSelectedServer(null);
    },
    [selectedServer, fetchInstallations]
  );

  const handleToggle = useCallback(
    async (slug: string, enabled: boolean) => {
      await fetch('/api/mcp/installations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, enabled }),
      });
      await fetchInstallations();
    },
    [fetchInstallations]
  );

  const handleApprovalToggle = useCallback(
    async (slug: string, requireApproval: boolean) => {
      await fetch('/api/mcp/installations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, require_approval: requireApproval }),
      });
      await fetchInstallations();
    },
    [fetchInstallations]
  );

  // ── Derived data ───────────────────────────────────────────────────────────

  const installationMap = new Map<string, Installation>(
    installations.map((i) => [i.server_slug, i])
  );

  // Installed tab count = installs + OAuth connections that have no install row.
  const installedCount =
    installations.length + connections.filter((c) => !installationMap.has(c)).length;

  // For InstalledList we need all servers including those not currently shown in browse
  // So we load them from the catalog (allServers = servers from catalog, unfilitered).
  // We pass `servers` (full catalog page) but also need unfilitered; when in installed tab
  // we re-fetch without filters to get all. For simplicity, keep a separate allServers ref.
  const [allServers, setAllServers] = useState<CatalogServer[]>([]);
  useEffect(() => {
    fetch('/api/mcp/registry', { cache: 'no-store' }).then((r) => r.json()).then((d) => setAllServers(d.servers ?? []));
  }, []);

  const selectedInstallation = selectedServer
    ? installationMap.get(selectedServer.slug)
    : undefined;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <AppShell title="Connectors">
      <div className="max-w-5xl mx-auto space-y-6 pb-12">
        {/* Page heading */}
        <div>
          <h1 className="text-2xl font-bold text-white">Connectors</h1>
          <p className="text-gray-400 mt-1 text-sm">
            Browse and install MCP connectors. Lucy will use them as tools during chat.
          </p>
        </div>

        {/* Tab toggle */}
        <div className="flex gap-1 p-1 bg-gray-900 border border-gray-800 rounded-xl w-fit">
          {(['browse', 'installed'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors capitalize ${
                tab === t
                  ? 'bg-gray-700 text-white'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {t === 'installed'
                ? `Installed${installedCount > 0 ? ` (${installedCount})` : ''}`
                : 'Browse'}
            </button>
          ))}
        </div>

        {/* Browse tab content */}
        {tab === 'browse' && (
          <div className="space-y-4">
            {/* Category chips + search */}
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Category chips */}
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setCategory(c.id)}
                    className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                      category === c.id
                        ? 'bg-lucy-600 border-lucy-500 text-white'
                        : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>

              {/* Search box + add custom */}
              <div className="flex items-center gap-2 sm:ml-auto">
                <div className="relative flex-1 sm:flex-none">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
                  <input
                    type="search"
                    placeholder="Search connectors…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="bg-gray-900 border border-gray-700 rounded-lg pl-8 pr-3 py-1.5 text-sm text-gray-200 placeholder-gray-600 outline-none focus:border-lucy-500 focus:ring-1 focus:ring-lucy-500 w-full sm:w-56"
                  />
                </div>
                <AddCustomConnector onAdded={() => fetchCatalog(category, query)} />
              </div>
            </div>

            {/* Connector grid */}
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="bg-gray-900 border border-gray-800 rounded-xl p-4 h-36 animate-pulse"
                  />
                ))}
              </div>
            ) : servers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="text-4xl mb-3">🔍</div>
                <p className="text-gray-400 text-sm">No connectors match your search.</p>
                <button
                  onClick={() => { setCategory('all'); setQuery(''); }}
                  className="text-xs text-lucy-400 hover:text-lucy-300 mt-2"
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {servers.map((server) => (
                  <ConnectorCard
                    key={server.slug}
                    server={server}
                    installation={installationMap.get(server.slug)}
                    connected={connections.includes(server.slug)}
                    onOpen={setSelectedServer}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Installed tab content */}
        {tab === 'installed' && (
          <InstalledList
            installations={installations}
            servers={allServers.length > 0 ? allServers : servers}
            connectedSlugs={connections}
            onToggle={handleToggle}
            onApprovalToggle={handleApprovalToggle}
            onConfigure={(s) => { setSelectedServer(s); }}
            onUninstall={(slug) => handleUninstall(slug)}
            onDisconnect={handleDisconnect}
          />
        )}

        {/* ── Embed a chat widget on your site ──────────────────────────── */}
        <section className="pt-4 border-t border-gray-800">
          <h2 className="text-base font-semibold text-white mb-2">Embed a chat widget on your site</h2>
          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="pt-4 space-y-2">
              <p className="text-sm text-gray-400">
                Build a customizable chat assistant — its own persona, knowledge/FAQ, model and look —
                and drop a one-line snippet on any website. Your API key is used server-side, so visitors
                never need one.
              </p>
              <a
                href="/widgets"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-lucy-600 hover:bg-lucy-500 text-white text-sm font-medium"
              >
                Open Chat Widgets builder →
              </a>
            </CardContent>
          </Card>
        </section>
      </div>

      {/* Detail modal (portal-style, rendered at page root) */}
      {selectedServer && (
        <ConnectorDetail
          key={selectedServer.slug}
          server={selectedServer}
          installation={selectedInstallation}
          onClose={() => setSelectedServer(null)}
          onInstall={handleInstall}
          onUninstall={() => handleUninstall()}
        />
      )}
    </AppShell>
  );
}
