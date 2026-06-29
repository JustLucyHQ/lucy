# Telegram Channel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let people chat with Lucy from Telegram (chat + memory + MCP tools) in two admin-selectable modes — a shared org bot or per-user linked accounts — over a webhook on justlucy.ai.

**Architecture:** A webhook route receives Telegram updates, verifies the secret token, returns 200 immediately, and processes the reply in Next 16 `after()`. An identity resolver maps the Telegram user to a Lucy user + that user's Lucy API key; the handler then calls the existing `POST /api/chat` server-to-server (reusing memory + MCP + providers) and sends the accumulated reply back via grammY. Config lives in three `lucy`-schema tables, managed from an admin panel. Connected (Supabase) mode only.

**Tech Stack:** Next.js 16 App Router, TypeScript, grammY (new dep), Supabase (`lucy` schema), Jest. Reuses `lib/mcp/secret` (AES-GCM), `lib/auth/api-keys` (`createApiKey`/`validateApiKey`), `lib/auth/admin` (`isAdminUser`/`getServiceClient`), `lib/api/rate-limit` (`checkRateLimit`/`getClientIp`).

**Established signatures (do not re-derive):**
- `encryptSecret(plain) -> "iv:tag:ct"`, `decryptSecret(enc) -> string|null` (keyed from `SUPABASE_SERVICE_ROLE_KEY`).
- `createApiKey(userId, name) -> {key,id,prefix}|null`; `validateApiKey(authHeader) -> userId|null`.
- `isAdminUser(userId) -> boolean`; `getServiceClient() -> SupabaseClient(lucy)|null`.

---

## Phase A — Data layer + settings

### Task A1: Migration `lib/supabase/telegram.sql`
**Files:** Create `lib/supabase/telegram.sql`.

- [ ] Create three tables in `lucy` schema, service-role only (no anon policies):

```sql
create table if not exists lucy.telegram_settings (
  id int primary key default 1,
  bot_token_encrypted text,
  mode text not null default 'shared' check (mode in ('shared','linked')),
  allowlist bigint[] not null default '{}',
  shared_owner_user_id uuid,
  shared_api_key_encrypted text,
  default_provider text not null default 'anthropic',
  default_model text not null default 'claude-sonnet-4-6',
  webhook_secret text,
  enabled boolean not null default false,
  updated_at timestamptz default now(),
  constraint telegram_settings_singleton check (id = 1)
);

create table if not exists lucy.telegram_links (
  telegram_user_id bigint primary key,
  lucy_user_id uuid not null,
  api_key_encrypted text not null,
  linked_at timestamptz default now()
);

create table if not exists lucy.telegram_link_codes (
  code text primary key,
  lucy_user_id uuid not null,
  expires_at timestamptz not null,
  used boolean not null default false,
  created_at timestamptz default now()
);
alter table lucy.telegram_settings  enable row level security;
alter table lucy.telegram_links      enable row level security;
alter table lucy.telegram_link_codes enable row level security;
```

- [ ] Commit.

### Task A2: `lib/channels/telegram/settings.ts` (typed load/save) + test
**Files:** Create `lib/channels/telegram/settings.ts`, `__tests__/lib/channels/telegram/settings.test.ts`.

- [ ] Types + functions:

```ts
export interface TelegramSettings {
  botToken: string | null;          // decrypted
  mode: 'shared' | 'linked';
  allowlist: number[];
  sharedOwnerUserId: string | null;
  sharedApiKey: string | null;      // decrypted
  defaultProvider: string;
  defaultModel: string;
  webhookSecret: string | null;
  enabled: boolean;
}
export async function loadTelegramSettings(): Promise<TelegramSettings | null>; // null if no service client / no row
export async function saveTelegramSettings(patch: Partial<...raw...>): Promise<void>;
```
Encrypt `botToken`/`sharedApiKey` with `encryptSecret` on save; decrypt on load. Use `getServiceClient()`.

- [ ] Test the encrypt-on-save / decrypt-on-load round-trip with a mocked service client (mirror `__tests__/lib/auth/provider-keys.test.ts`). Verify token is never stored in plaintext.
- [ ] Commit.

### Task A3: Add grammY dep
- [ ] `npm install grammy` (+ `serverExternalPackages` already covers SDKs; add `grammy` if it needs node externals). Commit `package.json` + lockfile.

---

## Phase B — Webhook + bot transport

### Task B1: `lib/channels/telegram/bot.ts`
**Files:** Create `lib/channels/telegram/bot.ts`.

- [ ] `sendReply(token, chatId, text)` — split text into ≤4096-char chunks, `sendMessage` each; `sendTyping(token, chatId)`; thin wrappers over grammY `Api` (no long-running `Bot` instance needed for webhook). Export `parseUpdate(body)` returning `{ chatId, fromId, text, command, args }`.

### Task B2: `app/api/channels/telegram/route.ts` (webhook)
**Files:** Create the route. **Test:** `__tests__/app/api/channels/telegram/route.test.ts`.

- [ ] `export const runtime = 'nodejs'`. POST handler:
  1. Load settings; if null/`!enabled` → `return new Response('ok')` (200 no-op).
  2. Verify `req.headers.get('x-telegram-bot-api-secret-token') === settings.webhookSecret` (constant-time); else 401.
  3. Parse update; `after(() => handleUpdate(update, settings))` (import `after` from `next/server`); return 200 immediately.
- [ ] Tests: bad secret → 401; disabled → 200 no-op + handler not called.
- [ ] Commit.

---

## Phase C — Identity + chat handling

### Task C1: `lib/channels/telegram/resolve.ts` + test
**Files:** Create resolver + `__tests__/lib/channels/telegram/resolve.test.ts`.

- [ ] `resolveTelegramUser(fromId, settings) -> {kind:'ok', lucyUserId, apiKey} | {kind:'unauthorized'} | {kind:'needsLink'}`:
  - `shared`: if `allowlist.length && !allowlist.includes(fromId)` → `unauthorized`; else `{ok, sharedOwnerUserId, sharedApiKey}`.
  - `linked`: look up `telegram_links` by `fromId`; found → decrypt `api_key`; missing → `needsLink`.
- [ ] Tests: shared allowlisted / blocked / empty-allowlist; linked found / needsLink.
- [ ] Commit.

### Task C2: `lib/channels/telegram/handle.ts` + test
**Files:** Create handler + `__tests__/lib/channels/telegram/handle.test.ts`.

- [ ] `handleUpdate(update, settings)`:
  - `/start` → mode-appropriate welcome.
  - `/link <code>` (linked mode) → look up `telegram_link_codes` (unused, unexpired) → `createApiKey(lucyUserId,'telegram')` → insert `telegram_links` (encrypt key) → mark code used → confirm. Bad/expired → error message.
  - `/reset` → ack (stateless v1; conversation context is per-call).
  - plain text → `resolveTelegramUser`; on `unauthorized`/`needsLink` send guidance; on `ok`: `sendTyping`, then `fetch(SITE_URL + '/api/chat', { headers: { Authorization: 'Bearer '+apiKey, 'x-memory-enabled':'1', 'Content-Type':'application/json' }, body: { messages:[{role:'user',content:text}], model: settings.defaultModel, provider: settings.defaultProvider } })`, read the SSE stream, accumulate `content` deltas, `sendReply`.
- [ ] Tests (mock fetch + grammY Api + db): `/link` happy + expired; chat path accumulates SSE and replies; unauthorized path.
- [ ] Commit.

---

## Phase D — Admin + linking UI

### Task D1: `app/api/admin/telegram/route.ts` (admin-gated)
- [ ] GET (current settings, token masked) / POST (save settings) / POST `?action=register|unregister` (call Telegram `setWebhook`/`deleteWebhook` with `https://justlucy.ai/api/channels/telegram` + generate/store `webhook_secret`). Gate every method with `isAdminUser(resolveMemoryAuth(req).userId)`. Reuse the masking idiom from `lib/mcp` secret handling. Commit.

### Task D2: `components/admin/TelegramPanel.tsx` + mount in `/admin`
- [ ] Form: bot token (write-only), mode select, allowlist (comma list of IDs), shared owner (user picker → reuse the admin Users list), default model (reuse ModelSelector constraint to chat providers), enabled toggle, Register/Unregister webhook buttons, status line. Commit.

### Task D3: Settings "Connect Telegram" card (linked mode)
- [ ] `app/api/channels/telegram/link-code/route.ts` — auth via `resolveMemoryAuth`; insert a random `telegram_link_codes` row (10-min TTL); return `{ code }`. Add a card in Settings showing `/link <code>` + the bot @handle. Commit.

---

## Phase E — Verify + docs

### Task E1
- [ ] `npx tsc --noEmit` (0 errors), `npm run lint` (clean), `npx jest` (all pass), stop dev server + `npm run build` (passes).
- [ ] Update `docs/DEPLOYMENT.md` with the Telegram section (BotFather → token → Admin → Register webhook; requires connected mode + `telegram.sql`).
- [ ] Commit.

---

## Self-review notes
- **Spec coverage:** both modes (C1), memory+MCP (C2 via /api/chat headers), webhook+after (B2), token security (A2 encrypt + B2 secret verify), admin UI (D), link flow (C2+D3), tests each phase (A2,B2,C1,C2). ✓
- **Type consistency:** `TelegramSettings` shape used identically in resolve/handle/route. `resolveTelegramUser` returns the tagged union used in handle. ✓
- **Connected-mode-only:** every entry point returns/no-ops when `getServiceClient()` is null. ✓
