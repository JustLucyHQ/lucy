# Lucy ↔ Telegram Channel — Design

**Date:** 2026-06-24
**Status:** Approved (proceeding to plan + implementation)
**Goal:** Let people chat with Lucy from Telegram — with memory and MCP tools — in two admin-selectable modes (a shared org bot, or per-user linked accounts).

## Constraints & scope

- **Connected mode only.** A bot needs a server, persistent config, and Supabase. Standalone/localStorage mode cannot run it — the admin panel shows it as unavailable there.
- **v1 scope:** text messages → chat **+ memory recall/extraction + MCP tools**, both identity modes, **webhook** transport. No images/voice/inline-buttons in v1 (clean follow-ups).
- **Production domain:** `https://justlucy.ai`.

## Two identity modes (admin chooses `telegram.mode`)

1. **Shared (org) bot** — one bot for the whole org. Every message is handled as a single **owner account** (`shared_owner_user_id`): the owner's provider keys, the owner's memory (the org "brain"). A **Telegram user-ID allowlist** gates who may use it; non-allowlisted users get a polite refusal. *Natural fit for "one bot per organization."*
2. **Linked (personal)** — each Telegram user binds their own Lucy account. They DM the bot `/link <code>` where `<code>` was generated in **Settings → Connect Telegram**. After linking, messages use that user's own keys + private memory. Unlinked users are prompted to link.

Both share one resolution function; only the lookup differs.

## Reuse strategy (key decision)

The Telegram handler does **not** re-implement chat orchestration. It resolves the incoming Telegram user to a **Lucy user + that user's Lucy API key**, then makes a **server-to-server call to the existing `POST /api/chat`** (same origin) with that API key and the `x-memory-enabled` / MCP headers, accumulating the SSE stream into the full reply. This reuses memory recall, the MCP tool loop, provider dispatch, and AES-GCM key decryption with zero duplication.

- **Shared mode:** one Lucy API key for the owner account (admin generates/stores it once).
- **Linked mode:** a Lucy API key minted for the user at `/link` time, stored with the link.

## Data model (lucy schema — new migration `telegram.sql`)

- `telegram_settings` (single row, admin-managed): `bot_token` (AES-256-GCM via `lib/mcp/secret`), `mode` (`shared`|`linked`), `allowlist` (bigint[] of telegram user IDs), `shared_owner_user_id` (uuid), `shared_api_key` (encrypted Lucy API key), `default_provider`, `default_model`, `webhook_secret`, `enabled` (bool).
- `telegram_links`: `telegram_user_id` (bigint, pk) → `lucy_user_id` (uuid), `api_key` (encrypted), `linked_at`.
- `telegram_link_codes`: `code` (text, pk), `lucy_user_id`, `expires_at` (10 min TTL), `used` (bool).

All tables RLS-locked to service-role/admin; the webhook uses the service client.

## Components

- `app/api/channels/telegram/route.ts` — webhook. Verifies `X-Telegram-Bot-Api-Secret-Token` against `webhook_secret`; returns **200 immediately**; processes the reply inside Next 16 `after()` so a slow LLM/tool turn never trips Telegram's retry. Ignores updates when `enabled = false`.
- `lib/channels/telegram/bot.ts` — grammY `Bot` factory (token from settings), update parsing, send helpers (4096-char chunking, `sendChatAction('typing')`).
- `lib/channels/telegram/resolve.ts` — `resolveTelegramUser(update, settings)` → `{ lucyUserId, apiKey } | { unauthorized } | { needsLink }`.
- `lib/channels/telegram/handle.ts` — command router (`/start`, `/link <code>`, `/reset`) + the chat path (build the `/api/chat` call, accumulate SSE, reply).
- `lib/channels/telegram/settings.ts` — typed load/save of `telegram_settings` + webhook (un)register against the Telegram Bot API.
- **Admin UI:** `components/admin/TelegramPanel.tsx` in `/admin` — paste bot token, choose mode, manage allowlist, set shared owner + default model, **Register/Unregister webhook** buttons, enable toggle. Server actions via new `app/api/admin/telegram/route.ts` (admin-gated).
- **Settings UI (linked mode):** a "Connect Telegram" card in Settings that calls `POST /api/channels/telegram/link-code` → shows the user a `/link <code>` snippet.

## Webhook security

- Bot token encrypted at rest. Webhook registered with a random `secret_token`; every update verified against it (constant-time compare). HTTPS-only (justlucy.ai). Allowlist enforced in shared mode.

## Error handling

- Bot disabled / not configured → webhook 200 no-op.
- Provider/chat error → reply "⚠️ Lucy hit an error: <short>"; full detail logged server-side.
- Unauthorized (shared) / unlinked (linked) → friendly guidance message.
- Telegram API send failure → logged; no crash.

## Testing

- `resolve.ts`: shared (allowlisted/blocked), linked (found/needs-link) — mocked settings/db.
- `handle.ts`: `/link` happy path + bad/expired code; reply chunking at 4096.
- Webhook route: rejects bad secret token (401); 200 no-op when disabled.
- Settings encryption round-trip (reuses existing secret tests pattern).

## Deployment notes (add to DEPLOYMENT.md)

- Create bot via @BotFather → token into Admin → Telegram.
- Click "Register webhook" (sets `https://justlucy.ai/api/channels/telegram` + secret).
- Requires connected mode (Supabase) + the `telegram.sql` migration applied.

## Out of scope (fast-follow)

Images/voice/files, inline keyboards, group chats, streaming edits, per-org multi-tenant tier, rate limiting per Telegram user (the chat route already rate-limits per IP/key).
