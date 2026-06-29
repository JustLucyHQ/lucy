# Architecture

Lucy is a single Next.js 16 (App Router) application — UI, API routes, and middleware in one deployable.

```
Browser (React 19, Zustand, Tailwind tokens)
   │  SSE streaming, REST
   ▼
Next.js API routes ──► lib/providers (OpenAI · Anthropic · Gemini · Local · …)
   │                    lib/memory   (extraction, hybrid retrieval, injection)
   │                    lib/mcp      (connector marketplace + tool loop)
   │                    lib/screening, lib/integrations, lib/voice
   ▼
StorageAdapter ──► LocalStorageAdapter (standalone)
                └► SupabaseStorageAdapter (connected, lucy schema + RLS)

instrumentation.ts (connected mode, Node runtime only)
   └► in-process workflow worker ──► drains lucy.workflow_runs (SKIP LOCKED)
```

The same build runs two ways. **Standalone** (the desktop app, no env vars) keeps
everything in the browser — localStorage/IndexedDB, no auth, no server worker.
**Connected** (Supabase configured) adds auth, a `lucy` Postgres schema with RLS,
and a server-side workflow worker. Mode is auto-detected from environment at
runtime; no build flag switches between them.

## Key patterns

**Provider abstraction** (`lib/providers/`). Every AI provider implements one interface: `chat(messages, modelId, onChunk, config)`. The server wraps chunks as SSE events; the client parses the stream. Local models reuse the OpenAI SDK with a custom `baseURL` (Ollama / LM Studio), model IDs prefixed `ollama/` or `lmstudio/`.

**Dual storage** (`lib/storage/`). A `StorageAdapter` interface (conversations, messages, preferences, provider keys) with two implementations, wired through a `<StorageProvider>` React context. Detection is automatic: `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` set → `SupabaseStorageAdapter` (all tables in the `lucy` Postgres schema, RLS per user); unset → `LocalStorageAdapter` (browser localStorage; memory uses IndexedDB). Zustand stores write through the active adapter. Server code reads the URL as `SUPABASE_INTERNAL_URL || NEXT_PUBLIC_SUPABASE_URL` so an internal hostname can override the public one.

**Theme system** (`lib/theme.ts`). `<html>` carries `class="dark|light"` plus `data-theme` for brand themes; CSS variables per theme map to semantic Tailwind utilities (`bg-surface`, `border-edge`, `text-t1`…). A pre-hydration inline script prevents theme flash.

**Auth & route protection.** Supabase Auth (email + Google OAuth) with `proxy.ts` — the project root middleware, renamed from `middleware.ts` per Next 16 — guarding `/chat`, `/workflows`, `/settings`, `/account`. It redirects unauthenticated users to `/auth/login` and enforces **server-side 2FA** (TOTP via Supabase AAL2; email-OTP via a signed httpOnly cookie checked against `user_profiles`). In standalone mode (no Supabase env vars) it lets every route through. API routes derive identity server-side via `resolveMemoryAuth` — a Supabase cookie session, falling back to a Lucy API key — and never trust a `userId` from the request body.

**Memory** (`lib/memory/`). End-of-turn extraction (reconciliation-aware, Zod-validated, secret-guarded) writes through a `MemoryStore` — `SupabaseMemoryStore` (pgvector + Postgres FTS fused with reciprocal rank fusion, `k=60`) or `LocalMemoryStore` (IndexedDB, lexical search) chosen by `createMemoryStore`. On each turn the top memories (default 12) plus the profile are formatted into a system-prompt block (`buildRetrievalBlock`); access touches recency and lazily decays stale low-value entries. `/remember`, `/global`, and `/forget` write immediately, bypassing extraction.

**MCP** (`lib/mcp/`). A curated catalog (`lib/mcp/catalog.ts`) seeds `lucy.mcp_servers`; each user's `lucy.mcp_installations` rows hold AES-256-GCM-encrypted config (`lib/mcp/secret.ts`), decrypted server-side at call time. The chat route loads the user's enabled tools (`loadToolsForUser`) and runs a bounded tool-use loop (`MAX_ROUNDS = 5`) for OpenAI-compatible and Anthropic providers, connecting to each MCP server over stdio per call, emitting SSE metadata events that the UI renders as tool chips.

**Durable workflows** (`lib/workflow/`, `instrumentation.ts`). In connected mode a **Run** doesn't execute in the browser — it enqueues a row in `lucy.workflow_runs` with a snapshot of the workflow definition. `instrumentation.register()` boots a single in-process worker (Node runtime + Supabase configured only; the standalone server skips it). The worker polls every 3s, enqueues any due cron triggers and record events, then drains the queue via the `claim_workflow_run()` RPC — a `FOR UPDATE SKIP LOCKED` claim so concurrent workers never grab the same run. Each run decrypts the owner's provider keys **server-side** (`decryptProviderKey`, keys never reach the browser), executes through `WorkflowEngine`, streams per-node logs back to the row, and writes a terminal status (`queued → running → succeeded / failed / canceled`). Failed trigger runs re-enqueue with exponential backoff up to `max_attempts`. Standalone mode runs workflows in the browser with no worker, triggers, or history.

## Source map

| Path | What lives there |
|---|---|
| `app/` | Pages + API routes (App Router) |
| `components/` | React components by feature |
| `proxy.ts` | Root middleware — route protection + 2FA (Next 16) |
| `instrumentation.ts` | Server-boot hook; starts the workflow worker |
| `lib/providers/` | AI provider implementations + model catalog |
| `lib/storage/` | Storage adapters + `StorageProvider` context |
| `lib/store/` | Zustand stores |
| `lib/memory/` | Memory engine (extraction, stores, retrieval) |
| `lib/workflow/` | Workflow engine, worker, server-runner, scheduler |
| `lib/mcp/` | Connector marketplace + MCP client/server |
| `lib/auth/` | API keys, provider-key encryption, 2FA cookie |
| `lib/supabase/` | Clients + SQL schema files |
| `__tests__/` | Jest suites mirroring source paths |

## The `lucy` Postgres schema

In connected mode every table lives in the `lucy` schema (not `public`) with
RLS scoping rows to `auth.uid()`. Clients are created with `db: { schema: 'lucy' }`.
The SQL lives in `lib/supabase/*.sql` (applied manually, not migrated).

| Group | Tables |
|---|---|
| Chat | `conversations`, `messages`, `user_preferences`, `provider_configs` |
| Memory | `memories`, `memory_profiles`, `memory_entities`, `memory_settings` |
| Workflows | `workflows`, `workflow_runs`, `workflow_triggers`, `workflow_versions`, `workflow_events` |
| MCP | `mcp_servers`, `mcp_installations` |
| Auth | `user_profiles`, `api_keys`, `email_verification_codes`, `member_devices` |
| Other | `screenings`, `screening_answers`, `telegram_links`, `telegram_settings` |

`workflow_runs` is the durable queue: the `claim_workflow_run()` RPC
(`SECURITY DEFINER`, `FOR UPDATE SKIP LOCKED`) atomically claims one queued run,
sets it `running`, and bumps `attempt`.
