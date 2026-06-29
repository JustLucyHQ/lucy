# Local → Cloud Data Sync — Design

**Date:** 2026-06-24
**Status:** Approved
**Scope:** Let a desktop (standalone) Lucy user push their local conversations,
messages, and preferences into their justlucy.ai cloud account, re-runnably.

## Problem

The desktop app stores everything locally (`LocalStorageAdapter`). "Connect to
Cloud" only opens justlucy.ai in a browser — local chats/settings stay trapped
on-device. The desktop's own Next server is built local-first (no Supabase env),
so it cannot talk to Supabase; the cloud lives at a different origin
(justlucy.ai). Sync must cross that origin boundary.

## Approach (chosen)

**API-key push.** The desktop bundles local data and POSTs it to a new
`/api/sync/push` endpoint on justlucy.ai, authenticated with a Lucy API key
(`lucy_k_…`) — the same mechanism the CLI already uses. One-way (local→cloud),
**re-runnable**: a `client_id` column keyed to the local id makes a repeat push
update-in-place instead of duplicating, so it behaves like a manual "Sync" the
user can hit anytime. Bidirectional/automatic sync is explicitly out of scope.

Rejected: export/import file (more manual, second UI); full bidirectional
adapter sync (conflict resolution + realtime — too large for go-live).

## Why this fits the codebase

- `resolveMemoryAuth(req)` already resolves **both** cookie sessions and
  `lucy_k_` API keys, returning the **service client** for key callers
  (`lib/memory/auth.ts`). The push endpoint reuses it verbatim.
- Local ids are `conv_…` / `msg_…` (not UUIDs), while cloud `id` columns are
  Postgres `uuid`. So the push must mint new cloud UUIDs and remap
  `conversation_id`; `client_id` carries the local id for idempotency.
- Provider keys differ by store (localStorage plaintext vs. `provider_configs`
  AES-encrypted via `encryptProviderKey`). Key sync is **opt-in** (default off).

## Components

### 1. Schema migration — `lib/supabase/sync.sql` (apply as `supabase_admin`)

```sql
alter table lucy.conversations add column if not exists client_id text;
alter table lucy.messages      add column if not exists client_id text;
-- Plain (non-partial) unique indexes: Postgres treats NULLs as distinct, so
-- pre-existing rows (client_id NULL) never collide, and PostgREST can use these
-- as on_conflict targets.
create unique index if not exists conversations_user_client_uniq
  on lucy.conversations (user_id, client_id);
create unique index if not exists messages_conv_client_uniq
  on lucy.messages (conversation_id, client_id);
```

### 2. Bundle builder — `lib/sync/bundle.ts`

`buildLocalBundle(adapter, { includeProviderKeys }) → SyncBundle`. Pure, reused
by the UI (and testable):

```ts
interface SyncMessage { id: string; role: 'user'|'assistant'|'system'; content: string; model?: string; provider?: string; tokensUsed?: number; createdAt: number }
interface SyncConversation { id: string; title: string; model: string; provider: string; createdAt: number; updatedAt: number; messages: SyncMessage[] }
interface SyncBundle {
  conversations: SyncConversation[];
  preferences?: { theme?: string; defaultModel?: string; defaultProvider?: string; companyName?: string };
  providerKeys?: { provider: string; apiKey: string }[];
}
```

### 3. Push endpoint — `app/api/sync/push/route.ts`

- `OPTIONS` + CORS headers (`Access-Control-Allow-Origin: *`, allow
  `authorization, content-type`, methods `POST, OPTIONS`). `*` is safe — auth is
  a Bearer token, not cookies; the request is non-credentialed.
- `POST`: `resolveMemoryAuth(req)` → `{ userId, client }`; 401 if no `userId`.
  Validate the body is a `SyncBundle` (cap sizes defensively).
  - Batch-upsert conversations: `{ user_id, client_id: conv.id, title, model, provider, created_at, updated_at }` `onConflict: 'user_id,client_id'`, `select('id, client_id')` → map local id → cloud uuid.
  - Batch-upsert messages with `conversation_id` from that map, `client_id: msg.id`, `onConflict: 'conversation_id,client_id'`.
  - If `preferences`: upsert `user_preferences` by `user_id`.
  - If `providerKeys` (opt-in): upsert `provider_configs` `{ user_id, provider, api_key_encrypted: encryptProviderKey(apiKey), is_active: true }` `onConflict: 'user_id,provider'`.
  - Return `{ ok: true, conversations, messages, providerKeys }` counts (with CORS headers).

### 4. Desktop UI — `components/settings/CloudSyncCard.tsx`

Rendered in `app/settings/general/page.tsx` under a **Cloud** section, **only in
standalone mode** (`useStorageMode() === 'local'`). Flow:
- Paste a Lucy API key (stored in `localStorage['lucy.sync.key']`); a "Create a
  key" link opens `https://justlucy.ai/settings/api-access`.
- Optional checkbox "Also sync my API keys" (default off).
- **Push to cloud** → `buildLocalBundle(adapter, …)` → `fetch('https://justlucy.ai/api/sync/push', { method:'POST', headers:{ Authorization:`Bearer ${key}` }, body })` → shows "Synced N chats · M messages," stores `localStorage['lucy.sync.last']`.
- Errors surface inline (invalid key → 401, network/cloud-down → message).

### 5. Docs

`docs/DEPLOYMENT.md` desktop section + a short note in the CLI/README about the
sync endpoint and that it needs the `sync.sql` migration applied to the cloud DB.

## Verification

- `tsc` + `lint` + connected `npm run build` clean.
- Unit test for `buildLocalBundle` (shapes conversations+messages+prefs).
- Apply `sync.sql` to the dev Supabase; POST a small bundle to
  `/api/sync/push` with a valid `lucy_k_` admin key against a locally-running
  connected server; confirm rows land and a **second push does not duplicate**.

## Out of scope (future)

Bidirectional/automatic sync, conflict resolution, pulling cloud→local, syncing
MCP installs or memory.
