# OAuth "Connect" + Setup Help for Connectors — Design

**Date:** 2026-06-27
**App:** Lucy (`C:\RepositoryAI\LucyAI`, Next.js App Router, Supabase `lucy` schema, hosted justlucy.ai)
**Goal:** Make Lucy's `/connectors` page feel like Claude/Codex — **OAuth "Connect"** where a provider supports it, and **clear "how to get your key" help + doc links** where it doesn't — across a Claude-parity catalog of **44 connectors**.

---

## 1. Why

Today every connector authenticates by the user **pasting an API key/token** (AES-256-GCM encrypted into `lucy.mcp_installations.config`). That's friction-heavy and unlike Claude. We add:
- **A. OAuth "Connect"** — one click → provider consent → tokens managed for the user.
- **B. Setup help** — for key-based connectors, in-popup steps + a "Create your key →" deep link + Docs link.

## 2. Auth taxonomy (drives everything)

| authMethod | Meaning | Connect UX | Examples |
|---|---|---|---|
| `oauth_remote_mcp` | Provider hosts a remote MCP server with its own OAuth 2.1 (+ often **DCR** = no app registration) | "Connect" → provider consent, Lucy self-registers via DCR | Notion, Linear, Atlassian, Cloudflare, Sentry, Stripe, PayPal, Square, HubSpot, Intercom, Asana, Box, Canva, Figma, Zapier, Supabase, GitLab |
| `oauth_app` | OAuth exists but the **operator registers one app** (client id/secret in Lucy env) | "Connect" → provider consent | **GitHub (reference)**, Google Drive/Gmail/Calendar, Microsoft 365, Slack |
| `api_key` | Paste a token | key box + **help panel** | Apollo, WordPress, Airtable, Brave, Exa, Firecrawl, Tavily, Google Maps, Discord, Apify, Plaid |
| `connection_string` | Paste a DB URI | string box + help panel | Postgres, Redis, MongoDB, MSSQL |
| `none` | No credential | enable toggle | Filesystem, Fetch, Memory, Sequential Thinking, Puppeteer, Contractors Room |

## 3. The catalog — 44 connectors (even)

**OAuth (23):** GitHub*, Google Drive, Gmail, Google Calendar, Microsoft 365, Slack *(oauth_app)* · Notion, Linear, Atlassian, Cloudflare, Sentry, Supabase, GitLab, Stripe, PayPal, Square, HubSpot, Intercom, Asana, Box, Canva, Figma, Zapier *(oauth_remote_mcp)*
**API key (11):** Apollo, WordPress, Airtable, Brave Search, Exa, Firecrawl, Tavily, Google Maps, Discord, Apify, Plaid
**Connection string (4):** MSSQL, PostgreSQL, Redis, MongoDB
**Built-in / no-auth (6):** Filesystem, Fetch, Sequential Thinking, Memory, Puppeteer, Contractors Room

\* GitHub = reference implementation. Full per-connector metadata (endpoints, scopes, getKeyUrl, docsUrl, install ref, steps) lives in the research output and is transcribed into `lib/mcp/catalog.ts` + seeded into `lucy.mcp_servers`.

Notes: split Google into 3 concrete connectors (Drive/Gmail/Calendar, sharing one Google Cloud app). Dropped Shopify/QuickBooks (endpoints not independently verifiable). Added Apify to reach an even 44.

## 4. Architecture

**Reuse:** AES-256-GCM `lib/mcp/secret.ts`; `installer.ts` encode/decode/mask; `mcp_installations` + RLS; `ConnectorDetail.tsx`; `app/api/mcp/*`.

**New — config/types (`lib/mcp/types.ts`):**
- Add `authMethod` + per-connector `oauth?: { provider, remoteMcpUrl?, authorizeUrl?, tokenUrl?, scopes[], dcr?: boolean }`.
- Add help metadata: `docsUrl?`, and per secret-field `getKeyUrl?`, `steps?: string[]`.

**New — `lucy.oauth_connections` table** (per-user encrypted tokens):
```
id uuid pk, user_id uuid → auth.users on delete cascade,
provider text, connector_slug text,
access_token_enc text, refresh_token_enc text null, expires_at timestamptz null,
scope text null, account_label text null,
created_at, updated_at, unique(user_id, provider)
```
RLS: per-user select/insert/update/delete; service role reads for runtime. Reuses `encryptSecret`/`decryptSecret`.

**New — OAuth routes:**
- `GET /api/oauth/[provider]/start` → build PKCE + signed `state`, redirect to the provider's authorize URL (or, for `oauth_remote_mcp`, discover `/.well-known/oauth-authorization-server` + DCR first).
- `GET /api/oauth/[provider]/callback` → validate `state`, exchange code→token server-side, encrypt + upsert into `oauth_connections`, redirect `/connectors?connected=<slug>`.
- A **provider registry** (`lib/oauth/providers.ts`) maps provider → authorize/token URLs, scopes, DCR support, and how to use the token (bearer to a remote MCP, or env-injected into a stdio server).

**UI (`ConnectorDetail.tsx`):**
- `oauth_*` field → **"Connect with X"** / **"Connected ✓ · Disconnect"**.
- key/connection-string field → existing input **+ a "How to get your key" panel** (numbered `steps`, a **"Create your key →"** button to `getKeyUrl`, a **Docs** link to `docsUrl`).

**MCP client:** for an OAuth connector, fetch the user's token from `oauth_connections` at runtime and either (a) inject it as the stdio server's token env, or (b) send `Authorization: Bearer` to the remote MCP URL.

## 5. Security
client_secret server-only · signed/stored `state` (CSRF) validated on callback · PKCE where supported · code→token exchange server-side, token never reaches the browser · tokens encrypted at rest, masked in API responses · Disconnect deletes the row (revokes where the provider supports it) · least-privilege scopes; restricted/read-only keys recommended in help text.

## 6. Build order (incremental, each ships + deploys on its own)

1. **Catalog + Setup Help** *(no backend; biggest visible win, lowest risk)* — expand catalog to 44 with metadata; render the help panel. Deploy.
2. **OAuth framework + GitHub** *(oauth_app reference)* — `oauth_connections` table, provider registry, `/api/oauth/*` routes, Connect button; GitHub end-to-end; MCP client uses the token. Operator registers **1 GitHub OAuth App**.
3. **Remote-MCP OAuth (DCR) + remote transport** — MCP client gains streamable-HTTP + MCP OAuth (well-known discovery, DCR, PKCE) → Notion/Linear/Atlassian/Cloudflare/Sentry/Stripe/etc. Connect with **zero** app registration.
4. **Remaining oauth_app providers** — Google (one Cloud app for Drive/Gmail/Calendar), **Microsoft 365** (Azure/Entra app — Office access), Slack.
5. **connection_string helpers** — MSSQL build-from-source guidance, etc.

## 7. Operator setup (one-time, per OAuth provider)
- **GitHub** (increment 2): register an OAuth App at `github.com/settings/developers`, callback `https://justlucy.ai/api/oauth/github/callback` → `GITHUB_OAUTH_CLIENT_ID/SECRET` in Lucy env.
- **Microsoft 365** (increment 4): Entra app registration + Graph delegated permissions → `MS_OAUTH_CLIENT_ID/SECRET/TENANT`.
- **Google** (increment 4): one Google Cloud OAuth Web client (Drive+Gmail+Calendar APIs) → `GOOGLE_OAUTH_CLIENT_ID/SECRET`.
- `oauth_remote_mcp` providers with DCR need **nothing** from the operator.
Exact click-steps provided at each increment.

## 8. Out of scope (YAGNI now)
Per-org shared connections (per-user only) · auto-refresh until a provider that needs it is wired · Shopify/QuickBooks (re-add when endpoints confirmed) · custom user-supplied remote MCP URLs (later).

## 9. Verification
Help: each connector's "Create your key →" + Docs open the correct page. GitHub: Connect → consent → Connected; a GitHub tool call in chat succeeds via the OAuth token. Each increment: build clean, deploy to web04, smoke-test on justlucy.ai.
