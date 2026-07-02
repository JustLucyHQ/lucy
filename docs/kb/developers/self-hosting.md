# Self-hosting

Lucy is a Next.js 16 app built with `output: 'standalone'` (a single Node process, Docker-friendly). It runs in two modes:

- **Standalone** — zero infrastructure, data stays in each browser. No env vars.
- **Connected** — Supabase Postgres + Auth for accounts, memory, durable workflows, connectors, and channels.

This page is the production runbook for **connected** mode.

## Standalone (zero infrastructure)

```bash
npm install && npm run dev      # development, http://localhost:3001
npm run build && npm start      # production
docker compose up --build       # container on :3000
```

No environment variables are required. Users add provider keys in Settings; data stays in each browser.

## Connected (Supabase)

### 1. Environment — build-time vs runtime

This is the most important distinction. `NEXT_PUBLIC_*` vars are **inlined into the client bundle at build time** — they are *not* read at runtime. You must set them before `npm run build` (or pass them as Docker `--build-arg`). Everything else is a **runtime secret**, read when the server starts.

**Build-time (`NEXT_PUBLIC_*`, inlined — set before `next build`):**

| Var | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | yes | Canonical public URL, e.g. `https://justlucy.ai`. Drives OG/canonical/manifest URLs. |
| `NEXT_PUBLIC_SUPABASE_URL` | yes (connected) | Supabase project URL. Its presence enables connected mode + auth. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes (connected) | Supabase `anon` key. |
| `NEXT_PUBLIC_GA_ID` | optional | Google Analytics (gtag) ID. Loads **only on public pages** (landing, download, docs) — never the signed-in app. |

> Leaving the Supabase vars empty produces a **standalone build** (`isSupabaseEnabled()` is `false`, no login wall). Baking a dev Supabase URL into a build you ship to others makes their app try to reach your dev project and fail to log in.

**Runtime secrets (read when the server starts — never inlined, never in the image):**

```bash
SUPABASE_SERVICE_ROLE_KEY=...       # memory, screening, connectors, admin, provider-key crypto — server-only
SUPABASE_INTERNAL_URL=...           # see "Proxy gotcha" below — optional but usually needed behind a proxy

# SMTP — required for password reset + email-OTP 2FA
SMTP_HOST=...
SMTP_PORT=465
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM=...

# Optional server-side fallback provider keys
ANTHROPIC_API_KEY=...               # plus OPENAI_/GOOGLE_/GROQ_/MISTRAL_/DEEPSEEK_/XAI_/OPENROUTER_
OLLAMA_URL=http://localhost:11434
LM_STUDIO_URL=http://localhost:1234

# Optional: pick which account auto-promotes to admin (legacy bootstrap, see step 4)
LUCY_ADMIN_EMAIL=you@company.com
```

`NEXT_PUBLIC_GA_ID` typically lives in the committed `.env.production` (a GA ID is public). `.env.production` is loaded by `next build`, not `next dev`; the desktop build clears it to stay telemetry-free.

In connected mode, server fallback keys are only usable by **authenticated** callers — anonymous visitors cannot spend them. The full set of provider-key env vars is the list above; `.env.example` ships only the common three (`OPENAI_/ANTHROPIC_/GOOGLE_API_KEY`).

### 2. Database schema

All Lucy tables live in the `lucy` Postgres schema. Apply these migrations to your Supabase project (as `supabase_admin` on a self-hosted stack), roughly in this order:

```bash
psql < lib/supabase/schema.sql              # core: conversations, messages, prefs, workflows, screenings
psql < lib/supabase/api_keys.sql            # Lucy API keys (lucy_k_…) for CLI / sync / inter-app calls
psql < lib/supabase/auth_security.sql       # 2FA codes, device tracking, user profiles
psql < lib/supabase/memory.sql              # memory tables + indexes (needs pgvector ≥ 0.7)
psql < lib/supabase/memory_search.sql       # hybrid-search RPCs
psql < lib/supabase/mcp.sql                 # connector catalog + installations
psql < lib/supabase/telegram.sql            # Telegram channel (settings + links + link codes)
psql < lib/supabase/sync.sql                # desktop → cloud sync (client_id columns + indexes)
psql < lib/supabase/workflow_runs.sql       # durable workflow runs (queue columns + claim RPC)
psql < lib/supabase/workflow_triggers.sql   # schedule + webhook triggers + run cancellation
psql < lib/supabase/workflow_events.sql     # record-event triggers (event queue + DB triggers)
psql < lib/supabase/workflow_retry.sql      # retry/backoff + idempotency (due-aware claim RPC)
psql < lib/supabase/workflow_versions.sql   # DRAFT/PUBLISHED workflow versions
psql < lib/supabase/oauth_connectors.sql    # one-click OAuth Connect: per-user tokens + DCR client cache
psql < lib/supabase/custom_connectors.sql   # user-added custom remote MCP connectors ("Add custom")
psql < lib/supabase/embed_widgets.sql       # embeddable chat widgets (base table, incl. starter-question cols)
psql < lib/supabase/embed_conversations.sql # widget conversation logging (powers the owner's Conversations tab)
```

`memory.sql` runs `create extension if not exists vector` (pgvector ≥ 0.7 for `halfvec` + `hnsw`). Some files in the directory are **not** separate steps: `screenings.sql` and `screening_rls_fix.sql` are reference DDL already folded into `schema.sql`; `embed_widgets_questions.sql` is an incremental `ALTER` already folded into `embed_widgets.sql`; and `seed_admin_key.sql` is a Contractors-Room-specific seed, not part of a general self-host.

Add `lucy` to PostgREST's exposed schemas: `PGRST_DB_SCHEMAS=public,storage,graphql_public,lucy`.

### 3. Supabase Auth URL config

In the Supabase dashboard, **Authentication → URL Configuration**:

- **Site URL:** your public origin, e.g. `https://justlucy.ai`
- **Redirect URLs (allowlist):** `https://justlucy.ai/auth/callback` and `https://justlucy.ai/**`

Without this, login redirects and confirmation/reset emails point at the wrong origin.

### 4. First admin

The first authenticated user becomes admin automatically when no admin exists. The role is stored in Supabase `app_metadata` (`lucy_role`). To steer which account auto-promotes, set `LUCY_ADMIN_EMAIL` before first login (legacy bootstrap only — it isn't checked afterward). Or use the CLI:

```bash
npx tsx lib/scripts/manage-admin.ts list
npx tsx lib/scripts/manage-admin.ts grant you@company.com
npx tsx lib/scripts/manage-admin.ts revoke someone@company.com
```

Admins manage everyone else from **Admin → Users & roles**.

### 5. Build & run (standalone server)

```bash
npm ci
npm run build                       # produces .next/standalone
node .next/standalone/server.js     # serves on PORT (default 3000)
# convenience: npm run start:standalone
```

> `next start` emits a warning under `output: 'standalone'` — use the standalone server above (or Docker). The build trace copies `.next/static` and `public/` into the bundle; if you relocate `server.js`, copy those alongside it.

### 6. Docker

The multi-stage `Dockerfile` and `docker-compose.yml` build the standalone server. `NEXT_PUBLIC_*` are **build args** (inlined at build); secrets are **runtime env**. Omit the Supabase build args for a local-first image; pass them for a connected image.

```bash
docker build \
  --build-arg NEXT_PUBLIC_SITE_URL=https://justlucy.ai \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ... \
  -t lucy .
# or: docker compose up --build   (reads NEXT_PUBLIC_* build args + runtime secrets from .env)
```

`docker-compose.yml` reads `SUPABASE_SERVICE_ROLE_KEY`, `SMTP_*`, and fallback provider keys from the environment (or an adjacent `.env`), and wires `host.docker.internal` so the container can reach Ollama / LM Studio on the host.

### 7. Reverse proxy, TLS, and the internal-URL gotcha

- Point your domain (A/AAAA or CNAME) at the host.
- Terminate TLS at your proxy (nginx / Caddy / Cloudflare) and forward to the Node process.
- Forward `X-Forwarded-*` headers so auth cookies are marked secure.

**Server-side Supabase calls must use an internal URL behind a proxy.** Browser login uses `NEXT_PUBLIC_SUPABASE_URL` (the public hostname) and works fine. But server-side code — auth proxy, provider-key crypto, memory, screening, the workflow worker — resolves its Supabase URL as `SUPABASE_INTERNAL_URL || NEXT_PUBLIC_SUPABASE_URL`. If the server reaches Supabase through that *same public hostname*, the request leaves the host and NAT-hairpins back through the proxy, often **timing out** while browser login still appears healthy. Set `SUPABASE_INTERNAL_URL` to an address the server can reach directly (e.g. the internal container/service URL, or the LAN/private IP of the Supabase host) to avoid the hairpin.

### 8. Channels & sync (optional)

- **Telegram bot** — needs connected mode + `telegram.sql`. Configure under **Admin → Channels → Telegram**, then **Register webhook** (public HTTPS only).
- **Desktop → cloud sync** — `POST /api/sync/push` upserts a desktop user's local data into their cloud account, authenticated with a Lucy API key (`lucy_k_…`). Needs `sync.sql` applied to the cloud project.

### 9. Security checklist

- `SUPABASE_SERVICE_ROLE_KEY` is server-only — never expose it to the browser or bake it into a Docker image.
- Provider keys are AES-256-GCM encrypted at rest (`/api/provider-keys`); they're decrypted server-side at call time and never reach the browser during a run.
- 2FA is enforced server-side in `proxy.ts`.
- Rate limiting on `/api/chat` is in-memory — put Redis/Upstash in front for serverless deployments.
- Confirm Supabase Auth Site URL + redirect allowlist match your origin (step 3) so reset/confirmation links can't redirect off-domain.
