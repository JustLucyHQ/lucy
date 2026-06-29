# Deploying Lucy to production (justlucy.ai)

This is the go-live runbook. Lucy is a Next.js 16 app built with
`output: 'standalone'` (optimized for Docker / a single Node process).

## 1. Environment variables

Set these in the production environment **before building** (`NEXT_PUBLIC_*`
are inlined at build time, not read at runtime):

| Var | Required | Value for production |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | yes | `https://justlucy.ai` |
| `NEXT_PUBLIC_SUPABASE_URL` | yes (connected mode) | your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes (connected mode) | Supabase `anon` key |
| `SUPABASE_SERVICE_ROLE_KEY` | yes (connected mode) | Supabase service-role key — **server-only, never expose** |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | yes (auth emails) | SMTP creds for password reset + email-OTP 2FA |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / … | optional | server-side fallback keys; users can supply their own in Settings → Providers |

See `.env.example` for the full list.

## 2. Database (Supabase)

Apply the SQL migrations to the production project (as `supabase_admin`), in
the `lucy` schema:

- `lib/supabase/schema.sql` — core tables
- `lib/supabase/auth_security.sql` — 2FA codes, device tracking, user profiles
- `lib/supabase/mcp.sql` — connectors (MCP servers + installations)
- `lib/supabase/telegram.sql` — Telegram channel (settings + links + link codes)
- `lib/supabase/sync.sql` — desktop → cloud sync (`client_id` columns + indexes)
- `lib/supabase/workflow_runs.sql` — durable workflow runs (queue columns + claim RPC)
- `lib/supabase/workflow_triggers.sql` — workflow triggers (schedule + webhook) + run cancellation
- `lib/supabase/workflow_events.sql` — record-event triggers (event queue + DB triggers on watched tables)
- `lib/supabase/workflow_retry.sql` — run retry/backoff + idempotency (columns + due-aware claim RPC)
- `lib/supabase/workflow_versions.sql` — DRAFT/PUBLISHED workflow versions
- any memory/embeddings migrations under `lib/supabase/`

## 3. Supabase Auth dashboard config

In **Authentication → URL Configuration**:
- **Site URL:** `https://justlucy.ai`
- **Redirect URLs (allowlist):** `https://justlucy.ai/auth/callback`, `https://justlucy.ai/**`

Without this, OAuth/login redirects and confirmation emails point at the wrong
origin.

## 4. Build & run

```bash
npm ci
npm run build                       # produces .next/standalone
# Production server (standalone output):
node .next/standalone/server.js     # serves on PORT (default 3000)
```

> `next start` emits a warning under `output: 'standalone'` — use the
> standalone server above (or the Dockerfile) for production. Static assets
> (`.next/static`) and `public/` are copied into the standalone bundle by the
> build trace; if you relocate the server, copy those alongside it.

A convenience script is available: `npm run start:standalone`.

## 5. Reverse proxy / DNS / TLS

- Point `justlucy.ai` (A/AAAA or CNAME) at the host.
- Terminate TLS at your proxy (nginx/Caddy/Cloudflare) and forward to the Node
  process. Forward `X-Forwarded-*` headers so auth cookies are marked secure.

## 6. Pre-launch checklist

- [ ] `npm run build` passes (CI gate)
- [ ] All `lib/supabase/*.sql` applied to prod DB
- [ ] Supabase Auth Site URL + redirect allowlist set to `justlucy.ai`
- [ ] `NEXT_PUBLIC_SITE_URL=https://justlucy.ai` set at build time
- [ ] SMTP verified (send a password-reset to yourself)
- [ ] First account promoted to admin (oldest account auto-promotes; or set `LUCY_ADMIN_EMAIL`)
- [ ] PWA icons present: add `public/icon-192.png` and `public/icon-512.png` (referenced by `app/manifest.ts`; currently 404)

## 7. Telegram bot (optional)

Requires connected mode + the `telegram.sql` migration.

1. Create a bot with **@BotFather** and copy the token.
2. Go to **/admin → Channels → Telegram bot**: paste the token, choose a mode
   (**Shared** = one bot on your keys/memory, with an optional Telegram user-ID
   allowlist; **Linked** = each user binds their own account), pick the owner
   account (shared) and default model, **Save**.
3. Click **Register webhook** — Lucy points Telegram at
   `https://justlucy.ai/api/channels/telegram` with a secret token and enables
   the bot.
4. Linked mode: users open **Settings → General → Connect Telegram**, generate a
   code, and send `/link CODE` to the bot.

The webhook only works over public HTTPS (justlucy.ai), so verify after DNS/TLS.

## 8. Desktop app (Electron)

Lucy ships as a downloadable desktop app that runs the full server locally
(local-first, offline-capable) with an optional "Connect to Cloud" menu to
justlucy.ai. Code lives under `electron/` + `electron-builder.yml`.

```bash
npm run desktop:build    # next build with Supabase env CLEARED (local-first bundle)
npm run electron:dev     # build standalone + launch the desktop window (local test)
npm run dist             # build standalone + produce installers in dist-desktop/
```

**Local-first build (important):** `desktop:build` runs `next build` with
`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` cleared (via
`cross-env`), so the packaged client compiles in **standalone mode** —
`isSupabaseEnabled()` is `false`, no auth wall, data in localStorage/IndexedDB.
`desktop:prepare`, `electron:dev`, and `dist` all chain through it. Do **not**
ship a plain `next build`: it bakes your `.env.local` Supabase URL into the
bundle, and a fresh user's app then tries to reach your dev Supabase and fails
to log in ("failed to fetch").

**First run:** a fresh install has no account and no provider key, so the chat
page bounces the user to the onboarding wizard (`/onboarding`). The wizard lets
them power Lucy with a cloud API key **or** a local Ollama/LM Studio model, then
sets a `lucy.onboarded` flag so subsequent launches go straight to chat. The
optional "Connect to Cloud" card / View menu opens justlucy.ai for sync.

**Cloud Sync (local → cloud):** a desktop user can push their local chats and
settings into their justlucy.ai account from **Settings → General → Cloud**
(shown in standalone mode only). It bundles local conversations + messages +
preferences and POSTs them to `POST /api/sync/push` on justlucy.ai, authenticated
with a Lucy API key (`lucy_k_…`, created at Settings → API Access — the same auth
the CLI uses). Provider-key sync is an opt-in checkbox (default off). The push is
**one-way and idempotent** — a stable `client_id` (the local id) means re-syncing
updates in place rather than duplicating; bidirectional/auto sync is not built.

> **Migration required:** apply `lib/supabase/sync.sql` to the **cloud** Supabase
> (as `supabase_admin`) before sync works — it adds the `client_id` columns +
> unique indexes the push upserts target. Cross-origin POST is allowed via CORS
> on the route (Bearer-token auth, no cookies).

`dist` produces **NSIS .exe** (Windows), **.dmg** (macOS), **AppImage** (Linux)
via electron-builder. Notes:
- Build on (or cross-build for) each target OS; electron-builder downloads
  per-platform binaries on first run.
- **Icons:** add `build/icon.ico` / `.icns` / `.png` for branded installers
  (defaults to the Electron icon otherwise).
- **Signing:** unsigned builds trigger SmartScreen (Win) / Gatekeeper (Mac)
  warnings — add code-signing certs for public distribution.

## 9. Known follow-ups (non-blocking)

- Chat-page hydration: the one persisted-state-derived render (the active-persona
  indicator) is gated behind a `useSyncExternalStore` mount flag, and theme is
  applied via a pre-hydration inline script with `suppressHydrationWarning` — so
  the chat page is hydration-safe by construction. (Earlier "cosmetic warning"
  note resolved.)
- Workflows run client-side (no scheduling/durability) and LLM nodes support
  OpenAI / Anthropic / Google. Durable/scheduled execution is a planned effort.
- Desktop offline voice still depends on a cloud/Whisper STT endpoint; a bundled
  local Whisper option is backlog.

## 10. Docker

A multi-stage `Dockerfile` (+ `.dockerignore`, `docker-compose.yml`) builds the
standalone server. `NEXT_PUBLIC_*` are **build args** (inlined at build time);
server secrets are **runtime env**. Omit the Supabase build args for a
local-first image, pass them for a connected image:

```bash
# Connected (cloud) image
docker build \
  --build-arg NEXT_PUBLIC_SITE_URL=https://justlucy.ai \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=… \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=… \
  -t lucy .
# or: docker compose up --build   (reads NEXT_PUBLIC_* + secrets from .env)
```

## 11. Local Whisper (offline, key-free voice)

Lucy's STT already supports a `local` provider that talks to any
OpenAI-compatible `/v1/audio/transcriptions` endpoint — so offline voice just
needs a Whisper server to point at. A ready-to-run one ships in
`docker-compose.whisper.yml` (Speaches / faster-whisper):

```bash
docker compose -f docker-compose.whisper.yml up -d
```

Then in **Settings → Voice → Speech to Text**:
- **Provider:** Whisper (Local)
- **Base URL:** `http://localhost:5004/v1`
- **Model:** `Systran/faster-whisper-base.en` (downloads on first use, cached in
  a volume)

No API key, no network round-trip. Use the `:latest-cuda` image + a GPU
reservation for faster transcription. This works in the desktop app too — the
bundled local server forwards to the Whisper container on `localhost`.

## 12. Workflows (durable execution)

Connected mode runs workflows **server-side**: clicking Run enqueues a
`lucy.workflow_runs` row, an in-process worker (started by `instrumentation.ts`,
connected mode only) claims it via `claim_workflow_run()` (`SKIP LOCKED`),
executes with the user's decrypted provider keys, and persists status + per-node
logs. The builder polls the run and a Runs panel shows history. Requires
`lib/supabase/workflow_runs.sql` applied to the DB. Desktop/standalone keeps the
client-side engine (no worker).

**Triggers (Phase 2a):** workflows can run on a **cron schedule** or from a
**webhook**. Triggers are rows in `lucy.workflow_triggers` storing a definition
snapshot; the worker tick enqueues due cron runs, and
`POST /api/workflows/triggers/<id>/webhook?token=<secret>` enqueues from a request
body. Runs can be canceled (queued → immediate, running → at the next node).
Requires `lib/supabase/workflow_triggers.sql`.

**Record-event triggers (Phase 2b):** a workflow can also run when a row is
created/updated/deleted in a watched table (`lucy.conversations`, `lucy.memories`).
A Postgres `AFTER` trigger emits into `lucy.workflow_events`; the worker tick
matches enabled `record_event` triggers (scoped to the owner's own records) and
enqueues a run with the changed row as input, then clears the event. Requires
`lib/supabase/workflow_events.sql` (adds the events queue + emit trigger and
widens the trigger-type CHECK to include `record_event`).

**Phase 3 (nodes, retry, versions):**
- **Nodes:** **Filter** (continue only if a predicate holds), **Code** (`(input) => output` JS snippet), **Send Email** (SMTP; server-only via an injected engine dep). Iterator/Form (loops + human-input suspend) remain a future "engine v2".
- **Retry/backoff + idempotency** (`workflow_retry.sql`): a failed run retries with exponential backoff (10s/20s/40s…, cap 5 min) up to `max_attempts` (trigger-initiated runs default 3; manual 1); the claim RPC is due-aware. Cron/record-event/webhook enqueues carry an `idempotency_key` (unique index) so re-processed events / double-fires don't duplicate.
- **DRAFT/PUBLISHED versions** (`workflow_versions.sql`): the canvas is the draft; **Publish** snapshots it as a numbered version (`POST /api/workflows/<id>/versions`), and the Versions panel lists history and restores any version into the editor.
