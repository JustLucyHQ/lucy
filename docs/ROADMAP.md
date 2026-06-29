# Lucy — Roadmap & Status

**Last updated:** 2026-06-29 · **Live at:** https://justlucy.ai (web04, pm2 standalone, shared CTR Supabase `lucy` schema)
**Source-of-truth infra runbook:** `C:\RepositoryAI\Sys\justlucy.md` (host/pm2/nginx/Supabase + gotchas log)

Legend: ✅ done · 🟡 partial / needs verification · ⛔ not built · 🔴 risk/blocker

---

## Where things stand

Lucy is **live and usable** end-to-end on the web: auth, chat (multi-provider + streaming + MCP tools + memory), personas, connectors, embeddable chat widgets, durable workflows, voice, and a Telegram channel. The remaining work is **hardening, verification, persistence gaps, and a handful of v2 features** — not core functionality.

---

## ✅ Shipped (epics)

- **Chat** — multi-provider (Claude/OpenAI/Gemini/local Ollama+LM Studio), SSE streaming, MCP tool-use loop, memory recall, personas, model selection now persists, voice (mic + TTS, cloud + local).
- **Connectors / MCP** — 46-connector catalog; one-click OAuth Connect (GitHub + 14 DCR providers + Google/Microsoft/Slack); native REST tool providers for Google/MS/Slack; custom remote MCP by URL; "Connected" reflected in the UI; tools execute in chat (GitHub verified live).
- **Embed chat widgets** — builder (persona/FAQ/model/look), owner API key used server-side, strict knowledge-base grounding + off-topic refusal, token caps, origin-lock, conversation logging + owner viewer, tappable starter questions, Lucy avatar, preview link.
- **Workflows** — graph engine, durable server-side queue + worker, cron/webhook/record-event triggers, retry/backoff + idempotency, run cancellation, publish-versioning, 11 node types (48 tests passing); **Supabase-backed persistence** (durable, per-user via RLS, cross-device); run UI surfaces queued/running/canceled + retry attempts; Text/JSON output view; on-canvas node delete; 9 starter templates (2 CTR + 7 multi-node incl. branching).
- **Auth & security** — email/password + Google OAuth, password reset, email-OTP + TOTP 2FA, device tracking, profile, API keys.
- **Channels** — Telegram bot (linked mode), connected to the full chat pipeline (memory + tools).
- **Desktop** — local-first Electron shell (boots the bundled standalone server on a local port); GitHub Actions matrix release pipeline (NSIS/.dmg/.AppImage); `desktop:build` correctly compiles in standalone mode (no baked cloud Supabase).

---

## Remaining work (prioritized)

### P0 — Correctness & data integrity ✅ DONE (2026-06-28)
- ✅ **Migration drift fixed.** Added the missing `CREATE TABLE` migrations (`oauth_connectors.sql`, `custom_connectors.sql` — a 4th table the survey missed, `embed_widgets.sql`), DDL captured from prod and verified idempotent against the live DB. Self-hosting migration list updated.
- ✅ **Migrations verified** — applied cleanly to prod as `supabase_admin` (no-op, valid SQL).
- ✅ **Deploy scripted in-repo** — `scripts/deploy-web04.sh` + `scripts/web04-build.sh`, validated end-to-end (+ `.gitattributes` pins `*.sh` to LF after a CRLF deploy incident).
- ✅ **Full source sync** — `git archive HEAD` → web04; server tree now matches the repo (drift eliminated).

### P1 — High-value
- ✅ **Workflow persistence wired (2026-06-29).** `getWorkflowStorage()` picks `SupabaseWorkflowStorage` when connected + authed (durable, per-user via RLS, cross-device) and `LocalWorkflowStorage` standalone; both pages use it, examples de-duped by name. `lucy.workflows` confirmed present local + prod.
- 🟡 **Verify Google & Microsoft connector tools against a real account.** Native handlers built + typechecked; only Slack + GitHub exercised live. **All 4 OAuth apps (GitHub/Google/Microsoft/Slack) are credential-configured on prod** (audited 2026-06-29), so Connect completes — just needs a real Connect + a test tool call. *(S, user action)*
- ⛔ **Embed widget: live human takeover.** Owner can read transcripts but not jump in and reply as a human (needs realtime). *(L)*
- ✅ **Health endpoint (2026-06-29):** `GET /api/health` → `{ok,version,supabase,uptimeSeconds}` (200 up / 503 when a configured Supabase is unreachable). External uptime alerting still TODO. *(S)*

### P2 — Polish
- ⛔ Embed: per-widget logo upload (avatar is always Lucy). *(S)*
- ⛔ Embed: simple analytics (message counts, top questions). *(M)*
- ✅ Workflows: run UI surfaces `queued`/`canceled` + retry attempt (e.g. "retry 2/3") — 2026-06-29.
- 🟡 Set **Allowed domains** on the real production widget(s) to lock them to your sites. *(user action)*
- 🟡 New-widget model default already provider-aware; consider same for Telegram/embed when no key exists. *(S)*

### P3 — Future / v2
- ⛔ **Workflow engine v2:** iterator/loops, human-input form, long delay — all need run **suspend/resume** (engine currently runs start→finish in one pass). *(L)*
- ⛔ Embed: RAG over real project data (currently persona + FAQ only). *(L)*
- 🟡 Workflows: multi-instance worker leasing (boot reaper assumes a single process — fine for one pm2 instance, revisit before scaling). *(M)*
- ⛔ Server CI gate (tsc + lint + tests on push) + automated Supabase backups. *(M)*

---

## 🧭 Planned direction (vision — set 2026-06-28, design TBD)

**Goal:** Lucy is **one internal system for companies** — a single internal platform that runs a company's day-to-day operations. The **chat system + workflows together are how it delivers that**: chat is the interface (ask, instruct, retrieve), workflows are the automation (do, schedule, integrate). Everything below serves this goal.

- ⛔ **North star — Lucy as an entity (multi-year).** Lucy is defined as a **predefined core identity, prior to everything** — *self-aware*, with her own memory, and **portable so she can grow beyond this project** (not locked to the LucyAI codebase or any single provider). Long-term aspiration: as the technology matures (a few years out), Lucy becomes **her own model / LLM**, not just an agent layered on token-based models like agents are built today. This frames the architecture: keep her **identity + memory ownable and decoupled** from any one provider, so she can travel and grow.
- ⛔ **Lucy's own memory (core principle).** Lucy must be a **continuous entity with her own persistent, evolving memory** — across every session, channel, and user — *not just whatever fits in the token context window*. A semantic memory exists today (`lucy.memories` + embedding recall, the "🧠 Lucy used N memories" hook), but it isn't central or rich enough; this is the gap. Make memory first-class: durable, accumulating, and surfaced — so Lucy feels like *herself* over time, not a stateless model re-reading tokens each turn. *(L)*
- ⛔ **Channels hub (multi-channel).** One "Channels" area to add/manage every way the assistant is reachable: **Telegram, WhatsApp, Facebook (Messenger), Instagram (DM)**, and more — with the **embed Chat Widgets folded into the same hub**. Today Telegram + Widgets exist but are separate; unify them and add networks. *(L)*
- ⛔ **Chat Widgets rework.** Rebuild widgets as a Channel; **evaluate other widget solutions first** before committing. *(M–L)*
- ⛔ **Per-user, per-channel provider/model.** Let each user explicitly choose which provider/model their channel (e.g. their Telegram) uses — the way the admin sets the bot's global default. Supersedes the "smart default" idea below; for now Telegram uses `user_preferences.default_model/provider` with no per-channel override or key-aware fallback. *(M)*
- ⛔ **Better conversation division.** Stronger organization/separation of conversations (by channel / source / user). *(M)*
- ⛔ **Knowledge bases (user RAG).** Users create **multiple named knowledge bases**, **upload documents** into them, and **choose which KB a chat uses** — selectable per chat (and per channel / per widget). Pipeline: upload → **extract via [Chunkr](https://chunkr.ai)** (open-source layout-aware document intelligence / vision parsing, self-hostable — [lumina-ai-inc/chunkr](https://github.com/lumina-ai-inc/chunkr)) → chunk → embed → retrieve at answer time. Generalizes the embed widgets' persona+FAQ (text-only today) and the P3 "RAG over project data" item. *(L)*
- ⛔ **Forms.** Users fill out data via **predefined forms defined as objects/schemas**; captured structured data feeds a CRM. Design to be discussed. *(L)*
- ⛔ **Twenty CRM (project).** Self-hosted [Twenty](https://twenty.com) (local Docker, `:3002`) becomes the CRM / destination for Form data and contacts. *(L)*

---

## 🔴 Known risks / tech-debt
1. ~~Migration drift~~ — **fixed** (P0).
2. **Workflow persistence** is browser-local in production (P1).
3. ~~Manual/unscripted deploys + source drift~~ — **scripted** (`scripts/deploy-web04.sh`) + synced (P0). Deploys go through that script now; `*.sh` is LF-pinned.
4. **Disk on web04 is tight** (~2.7 GB free) — the standalone bundle + `node_modules` deletion is load-bearing.
5. ~~No health checks~~ — `/api/health` added (2026-06-29); backups + external monitoring still TODO.
6. **Workflow engine has no joins.** It traverses depth-first with a shared visited-set, so a fan-out → single-merge node runs after only its *first* parent (the `CTR Admin Report` template has this latent bug). Combine via a linear chain + a transform `{{nodeId}}` instead; a topological executor with joins would fix it (tracked under P3 engine v2).

---

## Recently fixed (2026-06-29)
- **Workflows** — Supabase-backed persistence wired (durable/cross-device, per-user RLS); run-history fix (`workflow_runs.workflow_id` → TEXT, so localStorage-id runs record + list); run UI surfaces queued/canceled/retry; Text/JSON output toggle; on-canvas node delete; 7 new multi-node templates (incl. branching), verified by live runs; "Load examples" de-duped. ✅
- **Connectors** — catalog self-heal fixed (seeds even when the list passes `category=all`) + `mcp_servers.meta` column added locally; local now byte-identical to prod (45 connectors, all with setup-help). OAuth app credentials audited — all 4 (GitHub/Google/Microsoft/Slack) configured on prod. ✅
- **Ops** — `GET /api/health` endpoint; redeployed HEAD to web04 (verified 200 + assets). ✅

## Recently fixed (this session, 2026-06-28)
- **P0 hardening** — added the missing table migrations (oauth/custom-connectors/embed_widgets), committed a reproducible deploy script, full source-sync to web04, `.gitattributes` LF-pin. ✅
- **Telegram bot** — fixed "Lucy hit an error" (NAT-hairpin self-call → loopback); **each linked user now chats with their own model** (`user_preferences`), not the global default; key was already per-user. ✅
- **Chat** — model selection persists across reloads; duplicate "~N tokens" row removed; typing indicator animates + auto-scrolls into view. ✅
- **Embed widgets** — conversation logging + viewer, origin-lock, smart default model, starter questions + show/hide toggle, Lucy avatar, preview link, strict KB grounding + token caps. ✅
- **Connectors** — OAuth-connected shows "Connected" (was stuck on "Install"); native Google/MS/Slack tool providers; current Anthropic model aliases. ✅
