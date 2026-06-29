# Connectors / MCP Marketplace — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An MCP connector marketplace — browse a curated catalog, install + configure connectors per-user (encrypted secrets), and have Lucy's AI call those connectors' tools during chat.

**Architecture:** Two `lucy` tables (`mcp_servers` catalog + per-user `mcp_installations`). `lib/mcp/` gains a catalog seed, registry, installer (with a self-contained AES-GCM secret helper), an MCP client over `@modelcontextprotocol/sdk` (stdio + http/sse), and a deferred tool loader. The `/connectors` page becomes the marketplace; the chat route gains a bounded tool-use loop (OpenAI-compatible + Anthropic).

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind (`lucy-`), Supabase (`lucy` schema, docker `supabase-db`), `@modelcontextprotocol/sdk`, Node `crypto`, Jest.

**Spec:** `docs/superpowers/specs/2026-06-09-connectors-mcp-marketplace-design.md` · **Branch:** `feat/connectors-marketplace`

---

## Conventions
- Verify each task: `npx tsc --noEmit` and (routes/pages) `npm run build`. Jest: `npx jest <path>`.
- DB: `docker exec -i supabase-db psql -U supabase_admin -d postgres` (postgres role can't CREATE in `lucy`). Save SQL to a file.
- Service-role client (no helper exists): inline `createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { db: { schema: 'lucy' } })` — copy from `app/api/auth/2fa/request/route.ts`. `resolveMemoryAuth(req)` → `{ userId, email, client }`. Browser: `getSupabaseClient()` (lucy schema).
- Secrets only server-side; **never** return decrypted config to the client. Commit per task; trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Do NOT push.
- Keep `Card/Button/Badge/Input`, the `lucy-` palette, AppShell.

## File map
- **Create:** `lib/supabase/mcp.sql`, `lib/mcp/secret.ts`, `lib/mcp/types.ts`, `lib/mcp/catalog.ts`, `lib/mcp/registry.ts`, `lib/mcp/installer.ts`, `lib/mcp/client.ts`, `lib/mcp/loader.ts`, `lib/mcp/tool-format.ts`, `app/api/mcp/registry/route.ts`, `app/api/mcp/installations/route.ts`, `app/api/mcp/tools/route.ts`, `components/connectors/ConnectorCard.tsx`, `components/connectors/ConnectorDetail.tsx`, `components/connectors/InstalledList.tsx`, plus tests `__tests__/lib/mcp/{secret,installer,loader,tool-format}.test.ts`.
- **Modify:** `app/connectors/page.tsx` (→ marketplace), `package.json` (sdk), `app/api/chat/route.ts` (tool loop).

---

# PHASE A — Catalog + Install/Config

### Task A1: Tables

**Files:** Create `lib/supabase/mcp.sql`

- [ ] **Step 1: Write SQL**
```sql
-- lib/supabase/mcp.sql — apply as supabase_admin after schema.sql
set search_path to lucy, public;

create table if not exists lucy.mcp_servers (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text,
  author text,
  category text not null,                 -- dev|productivity|messaging|data|payments|search|local|builtin
  icon text,
  transport text not null,                -- stdio|http|sse
  install_ref text,                       -- npm pkg (stdio) or base URL (http/sse)
  config_schema jsonb not null default '[]'::jsonb,   -- [{key,label,type,required,help}]
  tools jsonb not null default '[]'::jsonb,           -- [{name,description}]
  verified boolean not null default false,
  built_in boolean not null default false,
  install_count int not null default 0,
  rating numeric,
  created_at timestamptz not null default now()
);
alter table lucy.mcp_servers enable row level security;
create policy mcp_servers_read on lucy.mcp_servers for select using (true);  -- public catalog
-- writes are service-role only (no insert/update policy)

create table if not exists lucy.mcp_installations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  server_slug text not null,
  config jsonb not null default '{}'::jsonb,   -- secret values stored encrypted
  enabled boolean not null default true,
  require_approval boolean not null default false,
  installed_at timestamptz not null default now(),
  unique (user_id, server_slug)
);
alter table lucy.mcp_installations enable row level security;
create policy mcp_inst_select_own on lucy.mcp_installations for select using (auth.uid() = user_id);
create policy mcp_inst_insert_own on lucy.mcp_installations for insert with check (auth.uid() = user_id);
create policy mcp_inst_update_own on lucy.mcp_installations for update using (auth.uid() = user_id);
create policy mcp_inst_delete_own on lucy.mcp_installations for delete using (auth.uid() = user_id);

notify pgrst, 'reload schema';
```
- [ ] **Step 2: Apply** — `docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < lib/supabase/mcp.sql`. Verify both tables: `docker exec -i supabase-db psql -U supabase_admin -d postgres -tAc "select table_name from information_schema.tables where table_schema='lucy' and table_name like 'mcp_%' order by 1"` → `mcp_installations`, `mcp_servers`.
- [ ] **Step 3: Commit** — `git add lib/supabase/mcp.sql && git commit -m "feat(mcp): catalog + installations tables"`

### Task A2: Secret helper (TDD)

**Files:** Create `lib/mcp/secret.ts`; Test `__tests__/lib/mcp/secret.test.ts`

- [ ] **Step 1: Failing test**
```ts
// __tests__/lib/mcp/secret.test.ts
import { encryptSecret, decryptSecret } from '@/lib/mcp/secret';
describe('secret', () => {
  const KEY = 'test-service-role-key-1234567890';
  it('round-trips a value', () => {
    const enc = encryptSecret('ghp_supersecret', KEY);
    expect(enc).not.toContain('ghp_supersecret');
    expect(decryptSecret(enc, KEY)).toBe('ghp_supersecret');
  });
  it('different ciphertext each time (random IV)', () => {
    expect(encryptSecret('x', KEY)).not.toEqual(encryptSecret('x', KEY));
  });
  it('returns null on tampered/garbage input', () => {
    expect(decryptSecret('not-valid', KEY)).toBeNull();
  });
});
```
- [ ] **Step 2:** `npx jest __tests__/lib/mcp/secret.test.ts` → FAIL.
- [ ] **Step 3: Implement** (AES-256-GCM, key derived from the service-role key; server-only)
```ts
// lib/mcp/secret.ts
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

function keyFrom(secret: string): Buffer { return scryptSync(secret, 'lucy-mcp-secret', 32); }

/** "iv:tag:ciphertext" all hex. */
export function encryptSecret(plain: string, secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFrom(secret), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${ct.toString('hex')}`;
}
export function decryptSecret(enc: string, secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''): string | null {
  try {
    const [ivH, tagH, ctH] = enc.split(':');
    if (!ivH || !tagH || !ctH) return null;
    const d = createDecipheriv('aes-256-gcm', keyFrom(secret), Buffer.from(ivH, 'hex'));
    d.setAuthTag(Buffer.from(tagH, 'hex'));
    return Buffer.concat([d.update(Buffer.from(ctH, 'hex')), d.final()]).toString('utf8');
  } catch { return null; }
}
```
NOTE: before implementing, quickly check whether `lib/storage/supabase.ts` (or provider-config code) already exposes a clean server-side encrypt/decrypt util. If so, prefer reusing it and skip this file (update later tasks' imports). Otherwise use this self-contained helper.
- [ ] **Step 4:** `npx jest __tests__/lib/mcp/secret.test.ts` → PASS. Commit:
```bash
git add lib/mcp/secret.ts __tests__/lib/mcp/secret.test.ts
git commit -m "feat(mcp): AES-GCM secret helper for connector config"
```

### Task A3: Types + catalog seed

**Files:** Create `lib/mcp/types.ts`, `lib/mcp/catalog.ts`

- [ ] **Step 1: types**
```ts
// lib/mcp/types.ts
export type Transport = 'stdio' | 'http' | 'sse';
export type Category = 'dev' | 'productivity' | 'messaging' | 'data' | 'payments' | 'search' | 'local' | 'builtin';
export interface ConfigField { key: string; label: string; type: 'text' | 'secret'; required: boolean; help?: string; }
export interface ToolInfo { name: string; description: string; }
export interface CatalogServer {
  slug: string; name: string; description: string; author?: string; category: Category;
  icon?: string; transport: Transport; install_ref?: string;
  config_schema: ConfigField[]; tools: ToolInfo[]; verified?: boolean; built_in?: boolean;
}
export interface Installation {
  server_slug: string; config: Record<string, unknown>; enabled: boolean; require_approval: boolean;
}
```
- [ ] **Step 2: catalog** (curated seed + `seedCatalog`). Provide all entries:
```ts
// lib/mcp/catalog.ts
import type { CatalogServer } from './types';
import type { SupabaseClient } from '@supabase/supabase-js';

export const CATALOG: CatalogServer[] = [
  { slug: 'github', name: 'GitHub', description: 'Repos, issues, pull requests, code search.', author: 'modelcontextprotocol', category: 'dev', icon: '🐙', transport: 'stdio', install_ref: '@modelcontextprotocol/server-github', verified: true,
    config_schema: [{ key: 'GITHUB_PERSONAL_ACCESS_TOKEN', label: 'GitHub Personal Access Token', type: 'secret', required: true, help: 'Needs repo scope.' }],
    tools: [{ name: 'search_repositories', description: 'Search repositories' }, { name: 'create_issue', description: 'Create an issue' }, { name: 'get_file_contents', description: 'Read a file' }] },
  { slug: 'slack', name: 'Slack', description: 'Read & send messages, search channels.', category: 'messaging', icon: '💬', transport: 'stdio', install_ref: '@modelcontextprotocol/server-slack', verified: true,
    config_schema: [{ key: 'SLACK_BOT_TOKEN', label: 'Slack Bot Token', type: 'secret', required: true, help: 'xoxb- token.' }, { key: 'SLACK_TEAM_ID', label: 'Team ID', type: 'text', required: true }],
    tools: [{ name: 'post_message', description: 'Send a message' }, { name: 'list_channels', description: 'List channels' }] },
  { slug: 'notion', name: 'Notion', description: 'Pages, databases, search your workspace.', category: 'productivity', icon: '📝', transport: 'stdio', install_ref: '@notionhq/notion-mcp-server', verified: true,
    config_schema: [{ key: 'NOTION_TOKEN', label: 'Notion Integration Token', type: 'secret', required: true }],
    tools: [{ name: 'search', description: 'Search pages' }, { name: 'query_database', description: 'Query a database' }] },
  { slug: 'postgres', name: 'Postgres', description: 'Query any Postgres database (read-only).', category: 'data', icon: '🐘', transport: 'stdio', install_ref: '@modelcontextprotocol/server-postgres', verified: true,
    config_schema: [{ key: 'DATABASE_URL', label: 'Connection string', type: 'secret', required: true, help: 'postgres://user:pass@host/db' }],
    tools: [{ name: 'query', description: 'Run a read-only SQL query' }] },
  { slug: 'linear', name: 'Linear', description: 'Issues, projects, cycles.', category: 'productivity', icon: '📐', transport: 'stdio', install_ref: 'mcp-linear', verified: false,
    config_schema: [{ key: 'LINEAR_API_KEY', label: 'Linear API Key', type: 'secret', required: true }],
    tools: [{ name: 'list_issues', description: 'List issues' }, { name: 'create_issue', description: 'Create an issue' }] },
  { slug: 'stripe', name: 'Stripe', description: 'Customers, payments, invoices.', category: 'payments', icon: '💳', transport: 'stdio', install_ref: '@stripe/mcp', verified: true,
    config_schema: [{ key: 'STRIPE_SECRET_KEY', label: 'Stripe Secret Key', type: 'secret', required: true, help: 'sk_… (use a restricted key).' }],
    tools: [{ name: 'list_customers', description: 'List customers' }, { name: 'create_payment_link', description: 'Create a payment link' }] },
  { slug: 'brave-search', name: 'Brave Search', description: 'Web & local search for the AI.', category: 'search', icon: '🔎', transport: 'stdio', install_ref: '@modelcontextprotocol/server-brave-search', verified: true,
    config_schema: [{ key: 'BRAVE_API_KEY', label: 'Brave Search API Key', type: 'secret', required: true }],
    tools: [{ name: 'brave_web_search', description: 'Web search' }] },
  { slug: 'filesystem', name: 'Filesystem', description: 'Read/write local files in an allowed directory.', category: 'local', icon: '📁', transport: 'stdio', install_ref: '@modelcontextprotocol/server-filesystem', verified: true,
    config_schema: [{ key: 'ALLOWED_DIR', label: 'Allowed directory path', type: 'text', required: true, help: 'Absolute path the server may access.' }],
    tools: [{ name: 'read_file', description: 'Read a file' }, { name: 'write_file', description: 'Write a file' }, { name: 'list_directory', description: 'List a directory' }] },
  { slug: 'fetch', name: 'Fetch', description: 'Fetch and read web pages / HTTP APIs.', category: 'search', icon: '🌐', transport: 'stdio', install_ref: '@modelcontextprotocol/server-fetch', verified: true,
    config_schema: [], tools: [{ name: 'fetch', description: 'Fetch a URL as markdown' }] },
  { slug: 'contractors-room', name: 'Contractors Room', description: 'Your CTR projects, contracts, and messages.', category: 'builtin', icon: '🏗️', transport: 'http', built_in: true, verified: true,
    config_schema: [], tools: [{ name: 'list_projects', description: 'List projects' }, { name: 'send_message', description: 'Send a message' }] },
];

/** Idempotent upsert of the catalog into lucy.mcp_servers (service-role client). */
export async function seedCatalog(svc: SupabaseClient<any, any, any>): Promise<void> {
  for (const s of CATALOG) {
    await svc.from('mcp_servers').upsert({
      slug: s.slug, name: s.name, description: s.description, author: s.author ?? null,
      category: s.category, icon: s.icon ?? null, transport: s.transport, install_ref: s.install_ref ?? null,
      config_schema: s.config_schema, tools: s.tools, verified: s.verified ?? false, built_in: s.built_in ?? false,
    }, { onConflict: 'slug' });
  }
}
```
- [ ] **Step 3:** `npx tsc --noEmit` clean. Apply the seed once via a throwaway node/tsx call OR (simpler) seed in the registry route on first GET (see A5). For now seed manually:
```bash
npx tsx -e "import {createClient} from '@supabase/supabase-js'; import {seedCatalog} from './lib/mcp/catalog'; const c=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{db:{schema:'lucy'}}); seedCatalog(c).then(()=>console.log('seeded')).catch(e=>{console.error(e);process.exit(1)});"
```
Verify: `docker exec -i supabase-db psql -U supabase_admin -d postgres -tAc "select count(*) from lucy.mcp_servers"` → 10.
- [ ] **Step 4: Commit** — `git add lib/mcp/types.ts lib/mcp/catalog.ts && git commit -m "feat(mcp): connector catalog seed (10 connectors) + types"`

### Task A4: Installer (TDD on pure logic)

**Files:** Create `lib/mcp/installer.ts`, `lib/mcp/registry.ts`; Test `__tests__/lib/mcp/installer.test.ts`

- [ ] **Step 1: Failing test** (pure `validateConfig` + `maskConfig`)
```ts
// __tests__/lib/mcp/installer.test.ts
import { validateConfig, maskConfig } from '@/lib/mcp/installer';
import type { ConfigField } from '@/lib/mcp/types';
const schema: ConfigField[] = [
  { key: 'TOKEN', label: 'Token', type: 'secret', required: true },
  { key: 'TEAM', label: 'Team', type: 'text', required: false },
];
describe('validateConfig', () => {
  it('rejects missing required field', () => {
    expect(validateConfig(schema, { TEAM: 'x' }).ok).toBe(false);
  });
  it('accepts when required present', () => {
    expect(validateConfig(schema, { TOKEN: 'abc' }).ok).toBe(true);
  });
});
describe('maskConfig', () => {
  it('replaces secret values with a marker, keeps text', () => {
    expect(maskConfig(schema, { TOKEN: 'abc', TEAM: 'eng' })).toEqual({ TOKEN: '__set__', TEAM: 'eng' });
  });
  it('omits secret marker when unset', () => {
    expect(maskConfig(schema, { TEAM: 'eng' })).toEqual({ TEAM: 'eng' });
  });
});
```
- [ ] **Step 2:** `npx jest __tests__/lib/mcp/installer.test.ts` → FAIL.
- [ ] **Step 3: Implement** installer + registry:
```ts
// lib/mcp/registry.ts
import type { SupabaseClient } from '@supabase/supabase-js';
export async function listCatalog(svc: SupabaseClient<any, any, any>, opts: { category?: string; q?: string } = {}) {
  let query = svc.from('mcp_servers').select('*').order('built_in', { ascending: false }).order('name');
  if (opts.category && opts.category !== 'all') query = query.eq('category', opts.category);
  const { data } = await query;
  let rows = data ?? [];
  if (opts.q) { const q = opts.q.toLowerCase(); rows = rows.filter((r: any) => r.name.toLowerCase().includes(q) || (r.description ?? '').toLowerCase().includes(q)); }
  return rows;
}
export async function getServer(svc: SupabaseClient<any, any, any>, slug: string) {
  const { data } = await svc.from('mcp_servers').select('*').eq('slug', slug).maybeSingle();
  return data;
}
```
```ts
// lib/mcp/installer.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ConfigField } from './types';
import { encryptSecret, decryptSecret } from './secret';
export const SECRET_MARK = '__set__';

export function validateConfig(schema: ConfigField[], config: Record<string, unknown>): { ok: boolean; error?: string } {
  for (const f of schema) {
    if (f.required && (config[f.key] === undefined || config[f.key] === '' || config[f.key] === null))
      return { ok: false, error: `Missing required field: ${f.label}` };
  }
  return { ok: true };
}
/** For GET responses: secret values become a marker (never the value); text stays. */
export function maskConfig(schema: ConfigField[], config: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(config)) {
    const f = schema.find((s) => s.key === k);
    out[k] = f?.type === 'secret' ? SECRET_MARK : v;
  }
  // ensure unset secrets are simply absent (don't fabricate marks)
  return out;
}
/** Encrypt secret-typed values for storage. */
export function encodeConfig(schema: ConfigField[], config: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(config)) {
    const f = schema.find((s) => s.key === k);
    out[k] = f?.type === 'secret' && typeof v === 'string' && v !== SECRET_MARK ? encryptSecret(v) : v;
  }
  return out;
}
/** Decrypt for runtime use (server-only). */
export function decodeConfig(schema: ConfigField[], config: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(config)) {
    const f = schema.find((s) => s.key === k);
    if (f?.type === 'secret' && typeof v === 'string') { const d = decryptSecret(v); if (d !== null) out[k] = d; }
    else if (typeof v === 'string') out[k] = v;
  }
  return out;
}
export async function getInstallations(svc: SupabaseClient<any, any, any>, userId: string) {
  const { data } = await svc.from('mcp_installations').select('*').eq('user_id', userId);
  return data ?? [];
}
export async function install(svc: SupabaseClient<any, any, any>, userId: string, slug: string, config: Record<string, unknown>, schema: ConfigField[]) {
  // merge: if a secret comes in as the mask, keep the existing encrypted value
  const { data: existing } = await svc.from('mcp_installations').select('config').eq('user_id', userId).eq('server_slug', slug).maybeSingle();
  const merged: Record<string, unknown> = { ...(existing?.config ?? {}) };
  for (const [k, v] of Object.entries(config)) { if (v === SECRET_MARK) continue; merged[k] = v; }
  const encoded = encodeConfig(schema, merged);
  await svc.from('mcp_installations').upsert({ user_id: userId, server_slug: slug, config: encoded }, { onConflict: 'user_id,server_slug' });
}
export async function uninstall(svc: SupabaseClient<any, any, any>, userId: string, slug: string) {
  await svc.from('mcp_installations').delete().eq('user_id', userId).eq('server_slug', slug);
}
export async function patchInstall(svc: SupabaseClient<any, any, any>, userId: string, slug: string, patch: { enabled?: boolean; require_approval?: boolean }) {
  await svc.from('mcp_installations').update(patch).eq('user_id', userId).eq('server_slug', slug);
}
```
- [ ] **Step 4:** `npx jest __tests__/lib/mcp/installer.test.ts` → PASS. `npx tsc --noEmit` clean. Commit:
```bash
git add lib/mcp/installer.ts lib/mcp/registry.ts __tests__/lib/mcp/installer.test.ts
git commit -m "feat(mcp): installer (validate/encode/decode/mask) + registry"
```

### Task A5: registry API route

**Files:** Create `app/api/mcp/registry/route.ts`

- [ ] **Step 1: Implement** (GET catalog; seed lazily on first call so the catalog is always present)
```ts
import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resolveMemoryAuth } from '@/lib/memory/auth';
import { listCatalog } from '@/lib/mcp/registry';
import { seedCatalog, CATALOG } from '@/lib/mcp/catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function svc() { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { db: { schema: 'lucy' } }); }

export async function GET(req: NextRequest) {
  const { userId } = await resolveMemoryAuth(req);
  if (!userId) return Response.json({ servers: [] }, { status: 200 });
  const s = svc();
  const url = new URL(req.url);
  let servers = await listCatalog(s, { category: url.searchParams.get('category') ?? undefined, q: url.searchParams.get('q') ?? undefined });
  if (!servers.length && !url.searchParams.get('category') && !url.searchParams.get('q')) { await seedCatalog(s); servers = await listCatalog(s, {}); }
  return Response.json({ servers });
}
```
- [ ] **Step 2:** `npx tsc --noEmit` + `npm run build` clean. Commit:
```bash
git add app/api/mcp/registry/route.ts
git commit -m "feat(mcp): GET /api/mcp/registry (catalog, lazy-seeded)"
```

### Task A6: installations API route

**Files:** Create `app/api/mcp/installations/route.ts`

- [ ] **Step 1: Implement** (GET masked / POST install / PATCH / DELETE)
```ts
import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resolveMemoryAuth } from '@/lib/memory/auth';
import { getInstallations, install, uninstall, patchInstall, maskConfig, validateConfig } from '@/lib/mcp/installer';
import { getServer } from '@/lib/mcp/registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
function svc() { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { db: { schema: 'lucy' } }); }

export async function GET(req: NextRequest) {
  const { userId } = await resolveMemoryAuth(req);
  if (!userId) return Response.json({ installations: [] });
  const s = svc();
  const rows = await getInstallations(s, userId);
  const out = [];
  for (const r of rows) {
    const server = await getServer(s, r.server_slug);
    out.push({ server_slug: r.server_slug, enabled: r.enabled, require_approval: r.require_approval,
      config: maskConfig(server?.config_schema ?? [], r.config ?? {}) });   // secrets masked
  }
  return Response.json({ installations: out });
}

export async function POST(req: NextRequest) {
  const { userId } = await resolveMemoryAuth(req);
  if (!userId) return Response.json({ ok: false }, { status: 401 });
  const { slug, config } = await req.json().catch(() => ({}));
  const s = svc();
  const server = await getServer(s, slug);
  if (!server) return Response.json({ ok: false, error: 'unknown connector' }, { status: 404 });
  const v = validateConfig(server.config_schema ?? [], config ?? {});
  if (!v.ok) return Response.json({ ok: false, error: v.error }, { status: 400 });
  await install(s, userId, slug, config ?? {}, server.config_schema ?? []);
  return Response.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const { userId } = await resolveMemoryAuth(req);
  if (!userId) return Response.json({ ok: false }, { status: 401 });
  const { slug, enabled, require_approval } = await req.json().catch(() => ({}));
  await patchInstall(svc(), userId, slug, { enabled, require_approval });
  return Response.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { userId } = await resolveMemoryAuth(req);
  if (!userId) return Response.json({ ok: false }, { status: 401 });
  const slug = new URL(req.url).searchParams.get('slug');
  if (!slug) return Response.json({ ok: false }, { status: 400 });
  await uninstall(svc(), userId, slug);
  return Response.json({ ok: true });
}
```
- [ ] **Step 2:** `npx tsc --noEmit` + `npm run build` clean. Commit:
```bash
git add app/api/mcp/installations/route.ts
git commit -m "feat(mcp): installations API (GET masked / POST / PATCH / DELETE)"
```

### Task A7: Marketplace components

**Files:** Create `components/connectors/ConnectorCard.tsx`, `ConnectorDetail.tsx`, `InstalledList.tsx`

- [ ] **Step 1:** Build the three components matching the approved mockups + dark `lucy-` styling:
  - `ConnectorCard` — props `{ server, installed, onOpen }`; icon, name, category, description, tools count, an action chip (Install / Installed ✓ / Configure / built-in / 🔒 Soon for OAuth). `onOpen(server)` opens the detail.
  - `ConnectorDetail` — props `{ server, installation, onClose, onInstall(config), onUninstall }`; renders description, tools list, transport (local/remote), the config-schema form (text + password inputs; secret fields show `••• set` placeholder when already set), encrypted-storage note, Install/Save + Uninstall buttons.
  - `InstalledList` — props `{ installations, servers, onToggle, onConfigure, onUninstall, onApprovalToggle }`; enable/disable toggle, require-approval toggle, Configure, Uninstall.
Provide complete component code (follow the mockups). Keep them `'use client'`.
- [ ] **Step 2:** `npx tsc --noEmit` clean. Commit:
```bash
git add components/connectors/
git commit -m "feat(mcp): marketplace components (card, detail, installed list)"
```

### Task A8: Rewrite the connectors page

**Files:** Modify `app/connectors/page.tsx`

- [ ] **Step 1:** READ the current page. Replace its body with the marketplace: a Browse/Installed tab toggle, category chips + search (Browse), the `ConnectorCard` grid from `GET /api/mcp/registry`, the `InstalledList` from `GET /api/mcp/installations`, and the `ConnectorDetail` modal wired to POST/DELETE/PATCH. Keep it inside `<AppShell title="Connectors">`. **Preserve** the "Embed Lucy" snippet section as a small panel at the bottom, and keep the `registerContractorsRoom()` import/side-effect (CTR also appears as the `built_in` catalog card). Install state = a server is "installed" if its slug is in the installations list.
- [ ] **Step 2:** `npx tsc --noEmit` + `npm run build` clean. Manual: `/connectors` shows the grid; clicking a card opens the detail; installing a no-secret connector (Fetch) moves it to Installed.
- [ ] **Step 3: Commit**
```bash
git add app/connectors/page.tsx
git commit -m "feat(mcp): connectors page becomes the marketplace (browse/installed/detail)"
```

---

# PHASE B — Client + Chat Runtime

### Task B1: Add the MCP SDK

**Files:** Modify `package.json`

- [ ] **Step 1:** `npm install @modelcontextprotocol/sdk`. `npx tsc --noEmit` clean.
- [ ] **Step 2: Commit** — `git add package.json package-lock.json && git commit -m "build(mcp): add @modelcontextprotocol/sdk"`

### Task B2: MCP client

**Files:** Create `lib/mcp/client.ts`

- [ ] **Step 1:** READ the installed SDK's client + transport exports (`node_modules/@modelcontextprotocol/sdk/dist/.../client`) to confirm exact import paths (they version-shift). Implement a short-lived connect/list/call:
```ts
// lib/mcp/client.ts  (import paths: VERIFY against the installed sdk version)
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { CatalogServer } from './types';

export interface McpConn { listTools(): Promise<{ name: string; description?: string; inputSchema?: any }[]>; callTool(name: string, args: any): Promise<any>; close(): Promise<void>; }

export async function connect(server: CatalogServer, config: Record<string, string>): Promise<McpConn> {
  const client = new Client({ name: 'lucy', version: '1.0.0' }, { capabilities: {} });
  let transport: any;
  if (server.transport === 'stdio') {
    const [cmd, ...args] = (server.install_ref ?? '').startsWith('@') || !server.install_ref?.includes(' ')
      ? ['npx', '-y', server.install_ref!] : server.install_ref!.split(' ');
    transport = new StdioClientTransport({ command: cmd, args, env: { ...process.env, ...config } as Record<string, string> });
  } else {
    transport = new StreamableHTTPClientTransport(new URL(server.install_ref!));
  }
  await client.connect(transport);
  return {
    async listTools() { const r = await client.listTools(); return (r.tools ?? []).map((t: any) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })); },
    async callTool(name, args) { return client.callTool({ name, arguments: args }); },
    async close() { await client.close(); },
  };
}
```
- [ ] **Step 2:** `npx tsc --noEmit` + `npm run build` clean. Commit:
```bash
git add lib/mcp/client.ts
git commit -m "feat(mcp): MCP client (stdio + http transports)"
```

### Task B3: Loader + tool-format adapter (TDD on the adapter)

**Files:** Create `lib/mcp/loader.ts`, `lib/mcp/tool-format.ts`; Test `__tests__/lib/mcp/tool-format.test.ts`

- [ ] **Step 1: Failing test** for the format adapter (pure)
```ts
// __tests__/lib/mcp/tool-format.test.ts
import { toOpenAITools, toAnthropicTools, NAMESPACE_SEP } from '@/lib/mcp/tool-format';
const tools = [{ slug: 'github', name: 'create_issue', description: 'Create', inputSchema: { type: 'object', properties: { title: { type: 'string' } } } }];
describe('tool-format', () => {
  it('OpenAI shape namespaces the function name', () => {
    const o = toOpenAITools(tools)[0];
    expect(o.type).toBe('function');
    expect(o.function.name).toBe(`github${NAMESPACE_SEP}create_issue`);
    expect(o.function.parameters).toEqual(tools[0].inputSchema);
  });
  it('Anthropic shape namespaces the tool name + uses input_schema', () => {
    const a = toAnthropicTools(tools)[0];
    expect(a.name).toBe(`github${NAMESPACE_SEP}create_issue`);
    expect(a.input_schema).toEqual(tools[0].inputSchema);
  });
});
```
- [ ] **Step 2:** `npx jest __tests__/lib/mcp/tool-format.test.ts` → FAIL.
- [ ] **Step 3: Implement** adapter + loader:
```ts
// lib/mcp/tool-format.ts
export const NAMESPACE_SEP = '__';
export interface LoadedTool { slug: string; name: string; description?: string; inputSchema?: any; }
export const qualified = (t: LoadedTool) => `${t.slug}${NAMESPACE_SEP}${t.name}`;
export function parseQualified(q: string): { slug: string; name: string } { const i = q.indexOf(NAMESPACE_SEP); return { slug: q.slice(0, i), name: q.slice(i + NAMESPACE_SEP.length) }; }
export function toOpenAITools(tools: LoadedTool[]) {
  return tools.map((t) => ({ type: 'function' as const, function: { name: qualified(t), description: t.description ?? '', parameters: t.inputSchema ?? { type: 'object', properties: {} } } }));
}
export function toAnthropicTools(tools: LoadedTool[]) {
  return tools.map((t) => ({ name: qualified(t), description: t.description ?? '', input_schema: t.inputSchema ?? { type: 'object', properties: {} } }));
}
```
```ts
// lib/mcp/loader.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { getInstallations, decodeConfig } from './installer';
import { getServer } from './registry';
import { connect } from './client';
import type { LoadedTool } from './tool-format';
import type { CatalogServer } from './types';

/** Connect to each enabled install, list its tools, namespaced. Short-lived; closes conns. */
export async function loadToolsForUser(svc: SupabaseClient<any, any, any>, userId: string): Promise<LoadedTool[]> {
  const installs = (await getInstallations(svc, userId)).filter((i: any) => i.enabled);
  const out: LoadedTool[] = [];
  for (const inst of installs) {
    const server = await getServer(svc, inst.server_slug) as CatalogServer | null;
    if (!server || server.built_in) continue;  // built-ins handled via existing integration path
    try {
      const conn = await connect(server, decodeConfig(server.config_schema, inst.config ?? {}));
      const tools = await conn.listTools();
      await conn.close();
      for (const t of tools) out.push({ slug: server.slug, name: t.name, description: t.description, inputSchema: t.inputSchema });
    } catch { /* skip a connector that fails to connect */ }
  }
  return out;
}
```
- [ ] **Step 4:** `npx jest __tests__/lib/mcp/tool-format.test.ts` → PASS. `npx tsc --noEmit` clean. Commit:
```bash
git add lib/mcp/loader.ts lib/mcp/tool-format.ts __tests__/lib/mcp/tool-format.test.ts
git commit -m "feat(mcp): deferred tool loader + OpenAI/Anthropic format adapter"
```

### Task B4: tools API route

**Files:** Create `app/api/mcp/tools/route.ts`

- [ ] **Step 1: Implement** (POST {slug,tool,args} → decode config → connect → callTool → close)
```ts
import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resolveMemoryAuth } from '@/lib/memory/auth';
import { getServer } from '@/lib/mcp/registry';
import { getInstallations, decodeConfig } from '@/lib/mcp/installer';
import { connect } from '@/lib/mcp/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
function svc() { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { db: { schema: 'lucy' } }); }

export async function POST(req: NextRequest) {
  const { userId } = await resolveMemoryAuth(req);
  if (!userId) return Response.json({ ok: false }, { status: 401 });
  const { slug, tool, args } = await req.json().catch(() => ({}));
  const s = svc();
  const inst = (await getInstallations(s, userId)).find((i: any) => i.server_slug === slug && i.enabled);
  if (!inst) return Response.json({ ok: false, error: 'not installed' }, { status: 404 });
  const server = await getServer(s, slug);
  if (!server) return Response.json({ ok: false, error: 'unknown' }, { status: 404 });
  try {
    const conn = await connect(server as any, decodeConfig(server.config_schema ?? [], inst.config ?? {}));
    const result = await conn.callTool(tool, args ?? {});
    await conn.close();
    return Response.json({ ok: true, result });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : 'tool failed' }, { status: 500 });
  }
}
```
- [ ] **Step 2:** `npx tsc --noEmit` + `npm run build` clean. Commit:
```bash
git add app/api/mcp/tools/route.ts
git commit -m "feat(mcp): POST /api/mcp/tools (server-side tool execution)"
```

### Task B5: Chat tool-use loop (the hard one)

**Files:** Modify `app/api/chat/route.ts` (and possibly the provider interfaces in `lib/providers/`)

READ `app/api/chat/route.ts` and `lib/providers/index.ts` + `openai-compatible.ts` + `anthropic.ts` FULLY before changing anything. The current providers stream text only. You're adding an optional tool-use loop. Implement carefully and **do not break the existing no-tools chat path**.

- [ ] **Step 1: Gather tools** — early in the chat route, after resolving `userId` and the model/provider: if the provider is OpenAI-compatible or Anthropic (NOT Gemini/local-without-tool-support), call `loadToolsForUser(svc, userId)`. If it returns `[]`, run the existing streaming path unchanged.

- [ ] **Step 2: Tool-use loop** — when tools exist, run a bounded loop (max 5 rounds) at the provider layer. The cleanest approach that avoids rewriting every provider: add a dedicated, non-streaming "agentic" path used ONLY when tools are present, implemented inline in the chat route using the raw SDKs (the providers already hold the keys/baseURL):
  - **OpenAI-compatible:** use the `openai` SDK `chat.completions.create({ model, messages, tools: toOpenAITools(tools), tool_choice: 'auto', stream: true })`. Accumulate `tool_calls` deltas; when the model finishes with tool calls, for each: `parseQualified(fn.name)` → POST to the tool executor (or call `connect/callTool` directly server-side), append a `{ role: 'tool', tool_call_id, content }` message, and loop. When the model returns content with no tool calls, stream it to the client as the final answer.
  - **Anthropic:** use the `@anthropic-ai/sdk` `messages.stream` with `tools: toAnthropicTools(tools)`. On `tool_use` blocks, execute and append a `tool_result` user message; loop until a text-only response.
  - Bound to 5 rounds; if exceeded, stop and stream whatever text exists.
  - **Approval:** if the matched installation has `require_approval` and the tool is a write (heuristic: name starts with `create/update/delete/send/write/post` OR not in a read-allowlist), emit an SSE `approval_request` event and pause — for v1, if `require_approval` is set, SKIP auto-executing writes and instead inject a tool result of `{ error: 'approval required' }` so the model explains it needs approval. (Full interactive approval UI is a follow-up; this keeps it safe.)
- [ ] **Step 3: SSE events** — extend the stream to emit `tool_call` ({slug,tool,args}) and `tool_result` ({slug,tool,ok}) events before the final text, so the UI can show "🔧 calling GitHub…". Match the existing SSE metadata convention in the route (it already emits a `memoryCount` metadata event — follow that pattern; the client's `parseSSEStream` has an `onMetadata` hook).
- [ ] **Step 4:** `npx tsc --noEmit` + `npm run build` clean. If this task balloons beyond a clean, bounded change, STOP and report DONE_WITH_CONCERNS describing the integration friction rather than forcing a fragile rewrite.
- [ ] **Step 5: Commit**
```bash
git add app/api/chat/route.ts lib/providers/
git commit -m "feat(mcp): chat tool-use loop (OpenAI-compat + Anthropic) calling installed connectors"
```

---

# Final

### Task D1: Verify + UI tool events + docs

- [ ] **Step 1:** `npx jest` (all pass), `npx tsc --noEmit`, `npm run lint` (no NEW errors), `npm run build` (Compiled successfully + route count).
- [ ] **Step 2 (optional UI polish):** in the chat UI, render the `tool_call`/`tool_result` SSE events as small inline "🔧 used GitHub" chips (via the existing `onMetadata`/stream hook). If risky, leave for a follow-up and note it.
- [ ] **Step 3: Manual** (dev on 3001, logged in): install **Fetch** (no secret) → ask Lucy "fetch example.com and summarize" → confirm a real tool round-trip + a `tool_call` event. Install **Filesystem** with an allowed dir → "list files in that dir". Toggle `require_approval` and confirm a write is gated.
- [ ] **Step 4: Docs** — add a "Connectors / MCP Marketplace" subsection to `CLAUDE.md` (the `lucy.mcp_servers`/`mcp_installations` tables, `lib/mcp/*` modules, the `/api/mcp/*` routes, the catalog seed, the secret helper, the chat tool-use loop + provider scope, and how to apply `mcp.sql`). Reference the spec + this plan. Commit:
```bash
git add CLAUDE.md
git commit -m "docs: document the connectors / MCP marketplace"
```

---

## Self-Review (completed during planning)
- **Spec coverage:** tables (A1) · secret helper (A2) · catalog seed (A3) · installer+registry (A4) · registry API (A5) · installations API masked (A6) · marketplace UI (A7,A8) · MCP client stdio+http (B2) · loader+deferred (B3) · format adapter (B3) · tools route (B4) · chat tool-use loop OpenAI+Anthropic, bounded, approval (B5) · SSE tool events (B5,D1) · CTR folded in + embed kept (A8) · docs (D1). Covered.
- **Type consistency:** `CatalogServer`/`ConfigField`/`Installation` (types.ts), `validateConfig/maskConfig/encodeConfig/decodeConfig/install/uninstall/patchInstall/getInstallations` (installer), `listCatalog/getServer` (registry), `connect→McpConn{listTools,callTool,close}` (client), `loadToolsForUser→LoadedTool[]` + `qualified/parseQualified/toOpenAITools/toAnthropicTools/NAMESPACE_SEP` (tool-format/loader) — consistent across tasks.
- **Risk flags for the executor:** confirm the `@modelcontextprotocol/sdk` import paths against the installed version (B2); confirm an existing encryption util before adding `secret.ts` (A2); B5 is the heavy task — keep the existing no-tools path untouched and report DONE_WITH_CONCERNS rather than forcing a fragile provider rewrite; `seedCatalog` is idempotent (re-runnable).
