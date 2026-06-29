# Connectors / MCP Marketplace — Design Spec

**Status:** Approved (design) · **Date:** 2026-06-09 · **Owner:** Johnny
**Umbrella:** `2026-06-09-lucy-design-overhaul-vision.md` (sub-project #3) · **Branch:** `feat/connectors-marketplace`

## Goal

Turn Lucy's `/connectors` page into an **MCP connector marketplace** (modeled on Wayland's
integrations): users browse a curated catalog, install + configure connectors per-user, and
Lucy's AI calls those connectors' tools during chat. Built on the **Model Context Protocol**
so Lucy gains the whole MCP server ecosystem. Lucy already *exposes* an MCP server
(`lib/mcp/server.ts`); this adds an MCP **client** (consuming external servers) + the
marketplace UI + the chat runtime.

## Decisions (resolved during brainstorming)
- **Scope:** full marketplace incl. the **runtime** (the AI actually calls installed tools),
  built in two phases (A: catalog + install/config UI; B: client + chat runtime).
- **Connector auth:** **token / API-key config** (each connector declares a config schema; the
  user pastes a token, stored encrypted per-user). OAuth-only connectors deferred.
- **Transport:** both **local stdio** (npx/uvx-spawned) **and remote HTTP/SSE**.
- **Phase-B provider scope:** OpenAI-compatible tool-calling (OpenAI/DeepSeek/Groq/Mistral/xAI/
  OpenRouter/Ollama) **+ Anthropic**; Gemini's tool format is a follow-up.

## Current state
- `app/connectors/page.tsx` renders the in-memory `ProjectIntegration` registry (`lib/integrations/`)
  — Contractors Room + an embed snippet. Integrations are **code-registered**, not user-installable.
- `lib/mcp/server.ts` is a standalone server exposing Lucy's screening tools. **No MCP client.**
- No marketplace/installation tables. Secrets pattern exists: `provider_configs` encrypts API keys.
- App-shell sidebar already links `/connectors` (top-level, from sub-project #1).

---

## 1. Data layer — new `lucy` tables

`lib/supabase/mcp.sql` (apply after `schema.sql`, as `supabase_admin`):

- **`lucy.mcp_servers`** — the catalog (admin/seed-managed):
  `id uuid pk`, `slug text unique`, `name text`, `description text`, `author text`, `category text`
  (`dev | productivity | messaging | data | payments | search | local | builtin`), `icon text`,
  `transport text` (`stdio | http | sse`), `install_ref text` (npm package for stdio, or base URL for
  http/sse), `config_schema jsonb` (array of `{ key, label, type, required, help }`), `tools jsonb`
  (array of `{ name, description }` for display), `verified bool`, `built_in bool default false`,
  `install_count int default 0`, `rating numeric`. RLS: **public read** (catalog is browseable);
  writes service-role only.
- **`lucy.mcp_installations`** — per-user installs:
  `id uuid pk`, `user_id uuid → auth.users on delete cascade`, `server_slug text`, `config jsonb`
  (the user's filled config; **secret-typed values stored encrypted**), `enabled bool default true`,
  `require_approval bool default false`, `installed_at timestamptz default now()`,
  `unique (user_id, server_slug)`. RLS: user select/insert/update/delete own.
- **Secrets:** `config` values whose schema field `type === 'secret'` are encrypted at rest with the
  same helper `provider_configs` uses (reuse `lib/storage` / provider-config encryption — confirm the
  exact util at implementation). The installations GET **never returns decrypted secrets** to the
  client (returns a `••• set` marker, like the embedder key in memory settings).

## 2. `lib/mcp/` modules

- **`catalog.ts`** — the curated seed: an array of connector definitions (GitHub, Slack, Notion,
  Postgres, Linear, Stripe, Brave Search, Filesystem, Fetch), each with slug/name/category/icon/
  transport/install_ref/config_schema/tools. A `seedCatalog(serviceClient)` upserts them into
  `mcp_servers` by slug (idempotent). Contractors Room is represented as a `built_in` catalog row.
- **`registry.ts`** — `listCatalog(filter?)` / `getServer(slug)` reading `mcp_servers`.
- **`installer.ts`** — `install(userId, slug, config)`, `uninstall(userId, slug)`,
  `setEnabled(userId, slug, bool)`, `getInstallations(userId)`. Encrypts secret config values;
  validates against the server's `config_schema`.
- **`client.ts`** — the MCP client (uses `@modelcontextprotocol/sdk`):
  `connect(server, resolvedConfig)` → for `stdio` spawns the package via `StdioClientTransport`
  (config mapped to env per `config_schema`); for `http`/`sse` uses the HTTP/SSE transport to the
  `install_ref` URL. Exposes `listTools()` and `callTool(name, args)`. Connections are short-lived
  per request (connect → use → close) in v1.
- **`loader.ts`** — deferred tool-loading: `loadToolsForUser(userId)` returns the combined tool
  definitions for a user's **enabled** installations (each tool namespaced `slug__toolname` to avoid
  collisions), lazily — only invoked when the chat route decides tools may be needed.

## 3. API — `app/api/mcp/`

- `registry/route.ts` — `GET` (list/search the catalog; `?category=&q=`). Public-ish (authed).
- `installations/route.ts` — `GET` (user's installs, secrets masked), `POST` (install/configure:
  `{ slug, config }`), `PATCH` (`{ slug, enabled?, require_approval? }`), `DELETE` (`?slug=`). All
  authenticated via `resolveMemoryAuth`; writes go through `installer.ts`.
- `tools/route.ts` — `POST { slug, tool, args }` — authenticated; resolves the user's installation +
  decrypted config (service-role, server-side only), connects via `client.ts`, calls the tool,
  returns the result. Used by the chat runtime (Phase B).

## 4. UI — `app/connectors/`

Marketplace (both views approved in mockups):
- **Browse** — category chips + search + a grid of `ConnectorCard`s with install state
  (Install / Installed ✓ / Configure / built-in / 🔒 Soon for OAuth-only).
- **Installed** tab — the user's installs with enable/disable toggle, Configure, Uninstall, and a
  "require approval" toggle.
- **Detail/install panel** — description, the tools list, transport (local/remote), the config-schema
  form (token field for secrets), encrypted-storage note, Install & connect.
- Components: `components/connectors/ConnectorCard.tsx`, `ConnectorDetail.tsx`, `InstalledList.tsx`.
- The existing `ProjectIntegration` registry (Contractors Room + embed snippet) is **folded in**: CTR
  shows as a `built_in` connector; the embed-snippet section moves to a small "Embed Lucy" panel on
  the same page (kept, not lost). `registerContractorsRoom()` side-effect preserved.

## 5. Chat runtime — Phase B

`app/api/chat/route.ts` gains an MCP **tool-use loop**:
1. If the user has ≥1 enabled MCP installation, `loader.loadToolsForUser(userId)` builds tool defs.
2. Tool defs are passed to the model in its native format — **OpenAI-compatible** `tools` (function
   calling) for the OpenAI-style providers, **Anthropic** `tools` for Claude. A thin adapter in
   `lib/mcp/loader.ts` (or `lib/providers`) maps the MCP tool schema → each format.
3. On a tool call from the model: route it through `app/api/mcp/tools` (→ `client.callTool`). If the
   installation has `require_approval` and the tool is a write, pause and surface an approval prompt in
   the UI before executing (read tools auto-run).
4. Inject the tool result back into the conversation and continue streaming until the model produces a
   final answer (bounded loop, e.g. max 5 tool rounds).
- The chat SSE stream emits tool-call/result events so the UI can show "🔧 calling GitHub…".
- Providers without tool support (Gemini in v1) simply skip the tool loop.

## 6. Phasing (one plan, two build phases)
- **Phase A — Catalog + Install/Config:** the two tables, `catalog.ts` seed + `seedCatalog`,
  `registry.ts` + `installer.ts`, the `registry`/`installations` API, and the marketplace UI
  (browse/installed/detail). CTR folded in. *Shippable: connectors install + configure, secrets
  encrypted.* (No chat calls yet.)
- **Phase B — Client + Runtime:** `@modelcontextprotocol/sdk` dep, `client.ts` (stdio + http/sse),
  `loader.ts`, `tools` API, and the chat tool-use loop (OpenAI-compat + Anthropic) + the SSE
  tool-event UI. *Installed connectors now work in chat.*

## 7. Security
- Per-user encrypted secret config; never returned decrypted to the client (masked on GET).
- Tool execution is server-side only (`tools` route holds the decrypted config; the browser never
  sees tokens). Tool names namespaced per slug.
- **Write-action approval** toggle per installation (default off; read tools auto-run).
- **stdio caution:** spawning `npx` runs third-party code locally — only `verified`/built-in catalog
  entries are stdio-installable in v1; custom stdio servers are a later, explicitly-gated feature.
  Document the trust model in the UI ("runs locally on your machine").
- Bounded tool-loop (max rounds) to prevent runaway tool calls.

## 8. Testing
- Unit (Jest): `installer.ts` config validation + secret-masking; `loader.ts` tool namespacing +
  enabled-filtering; the tool-schema → OpenAI/Anthropic format adapter.
- Manual: install the official **filesystem** + **github** MCP servers, configure, then in chat ask
  Lucy to use them (e.g. "list my open GitHub issues") and confirm a real tool round-trip + the
  approval prompt on a write.
- `npx tsc --noEmit`, `npm run lint`, `npm run build` green per phase.

## 9. Excluded / deferred
- OAuth-only connectors (Google Workspace / Gmail / Microsoft 365) — a later sub-project.
- Messaging channels (Telegram / WhatsApp / Discord / SMS) — separate sub-project.
- Agent / assistant / team / skill packs (the rest of Wayland's surface).
- Gemini tool-calling format (Phase B follow-up).
- Custom/user-submitted catalog entries + ratings/reviews; long-lived pooled MCP connections.
