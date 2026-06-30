// lib/mcp/local-installs.ts
// Standalone (no-Supabase) connector support: the catalog is served straight from
// the bundled CATALOG, and installs live in localStorage — exactly like the rest
// of standalone mode (chat, personas, workflows). Connected mode keeps using the
// Supabase-backed API routes; this module is only used when storage mode is 'local'.
import { CATALOG } from './catalog';
import type { CatalogServer, Installation } from './types';

const KEY = 'lucy-mcp-installations';

/** Catalog filter for standalone — mirrors the registry route, minus connectors that
 *  need a server (built-ins and OAuth-only providers can't be set up without a backend). */
export function filterLocalCatalog(category?: string, q?: string): CatalogServer[] {
  const ql = (q ?? '').trim().toLowerCase();
  return CATALOG.filter((s) => !s.built_in)
    .filter((s) => s.meta?.authMethod !== 'oauth_remote_mcp' && s.meta?.authMethod !== 'oauth_app')
    .filter((s) => !category || category === 'all' || s.category === category)
    .filter((s) => !ql || s.name.toLowerCase().includes(ql) || (s.description ?? '').toLowerCase().includes(ql));
}

function readAll(): Installation[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Installation[]) : [];
  } catch {
    return [];
  }
}

function writeAll(rows: Installation[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify(rows));
}

export function getLocalInstalls(): Installation[] {
  return readAll();
}

/** Install or re-configure a connector. Config is stored as-is (local, single-user). */
export function installLocal(slug: string, config: Record<string, unknown>): void {
  const rows = readAll();
  const i = rows.findIndex((r) => r.server_slug === slug);
  if (i >= 0) rows[i] = { ...rows[i], config: { ...rows[i].config, ...config } };
  else rows.push({ server_slug: slug, config, enabled: true, require_approval: false });
  writeAll(rows);
}

export function uninstallLocal(slug: string): void {
  writeAll(readAll().filter((r) => r.server_slug !== slug));
}

export function patchLocal(slug: string, patch: Partial<Pick<Installation, 'enabled' | 'require_approval'>>): void {
  const rows = readAll();
  const i = rows.findIndex((r) => r.server_slug === slug);
  if (i >= 0) {
    rows[i] = { ...rows[i], ...patch };
    writeAll(rows);
  }
}
