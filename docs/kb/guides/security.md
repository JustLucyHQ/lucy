# Security & 2FA

Everything on this page applies to **connected mode** — Lucy with Supabase
configured. **Standalone mode** (no Supabase env vars) has **no accounts and no
login**: every route is public, there is no session, and the auth pages just
point you back to `/chat`. If you need real users, sign-in, and access control,
run connected mode (see [Self-hosting](/docs/self-hosting)).

## Two modes at a glance

| | Standalone | Connected (Supabase) |
|---|---|---|
| Login | None — all routes public | Email + password, or Google |
| Route protection | Off | `/chat`, `/workflows`, `/settings`, `/account` require a session |
| 2FA | n/a | TOTP app and/or email code, gated at login |
| Provider keys | Client-side, in the browser | AES-256-GCM encrypted, server-side |
| Data isolation | One browser, one user | Per-user row-level security |

Connected mode turns on automatically when `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY` are set.

## Sign in & sign up

- **Email + password** — sign up at `/auth/signup` with a password of **at least
  8 characters** and an optional company name. Supabase sends a confirmation
  email; click the link to activate the account before the session goes live.
- **Google** — "Sign in with Google" runs the Supabase OAuth flow and returns to
  `/auth/callback`, which exchanges the code for a session cookie and lands you on
  `/chat`.

The first account on a fresh deployment is auto-promoted to **admin** (or any
address in `LUCY_ADMIN_EMAIL`). Roles live in Supabase `app_metadata.lucy_role`,
which only the service role can write — users can't promote themselves. See
[Themes & account](/docs/themes-account) for the admin area.

## Route protection

A middleware (`proxy.ts`) guards the app. In standalone mode it allows
everything. In connected mode it checks the Supabase session on protected routes
and redirects unauthenticated visitors to the login page, preserving where they
were headed:

```
/chat  →  no session  →  /auth/login?redirectTo=/chat
```

| Protected | Always public |
|---|---|
| `/chat` · `/workflows` · `/settings` · `/account` | `/auth/*` · `/api/*` · `/embed` · `/personas` · `/onboarding` · `/` |

If a session check throws, the middleware **fails open** rather than locking you
out of the app.

## Two-factor authentication

2FA is **gated at a login challenge** — after a correct password (or OAuth), Lucy
checks for a second factor before letting you reach the app. Both kinds can be
enabled together from **Account → Security**.

| Method | How it works | Where it's enforced |
|---|---|---|
| **Authenticator app (TOTP)** | Scan a QR at `/auth/two-factor-setup`, then enter a 6-digit code each sign-in (`/auth/two-factor-challenge`) | Supabase MFA — the session must reach **AAL2**; a password-only session is AAL1 |
| **Email code (OTP)** | A 6-digit code is emailed; enter it at `/auth/2fa` | A signed, httpOnly cookie set on success, checked server-side |

**TOTP** is built on Supabase's MFA factors. The middleware reads the
Authenticator Assurance Level: if you have a verified factor but the session is
still AAL1, you're redirected to the challenge. Five wrong codes signs you out and
sends you to `/auth/account-locked`.

**Email 2FA** is opt-in via the `two_factor_email_enabled` flag on your profile.
The middleware enforces it with an HMAC-signed `lucy_2fa` cookie (httpOnly,
12-hour TTL, secret derived from the service-role key). The cookie — not a
client-side flag — is the real gate, so navigating straight to `/chat` after a
password login won't skip the code. Codes are sent over [SMTP](#email-delivery);
without SMTP configured, email 2FA can't deliver.

## Password reset (emailed code)

Reset uses a **6-digit code by email**, not a magic link:

1. Request at `/auth/forgot-password` → `POST /api/auth/reset/request`.
2. Lucy emails a code (15-minute expiry) and you land on `/auth/reset-password`.
3. Enter the code + a new password → `POST /api/auth/reset/confirm` updates the
   password via the service-role admin API.

The request endpoint is **rate-limited per IP** and returns an **identical
response whether or not the email exists**, so it never reveals which addresses
are registered.

## How verification codes are stored

Both reset and email-2FA codes share one hardened mechanism (`lib/email/codes.ts`,
table `lucy.email_verification_codes`):

| Property | Value |
|---|---|
| Format | 6 digits |
| Storage | **scrypt hash** (`salt:dk`) — never the plaintext code |
| Expiry | 15 minutes |
| Max attempts | 5, then the code is dead |
| Single use | Marked `consumed_at` once accepted |

The table is **service-role only** (RLS on, no client policies), so the browser
can never read codes — only server route handlers touch them.

## Active devices

Each sign-in registers the browser in `lucy.member_devices` (fingerprint from
user-agent, language, screen size and timezone; browser, OS, IP, last-active
time). **Account → Security** lists every device, flags the current one, and lets
you remove any you don't recognize. Row-level security scopes reads and deletes to
your own rows (`auth.uid() = user_id`); writes go through a service-role track
route.

## The account page

Reach it from your avatar at the bottom-left of the sidebar. Three sections:

- **Profile** (`/account/profile`) — display name, avatar URL, company. Email is
  read-only (managed by your login provider).
- **Security** (`/account/security`) — change password, enable/disable the
  authenticator app, toggle email 2FA, and manage devices.
- **Billing** (`/account/billing`) — plan and usage. Self-hosted Lucy is free.

## Encrypted provider keys

Provider API keys you save in connected mode are **AES-256-GCM encrypted at rest**
in `lucy.provider_configs`. Encryption is keyed from `SUPABASE_SERVICE_ROLE_KEY`
and rows are tagged `enc:v1:` (`iv:tag:ciphertext`). Keys are decrypted
**server-side only** — they never reach the browser during a chat or workflow run.
Older rows written with the legacy XOR obfuscation are still readable and get
re-encrypted opportunistically when read. See [Chat & models](/docs/chat) for how
keys are used.

## Secrets at rest

Every other secret Lucy keeps in the database is encrypted the same way (AES-256-GCM,
`lib/mcp/secret.ts`, keyed from `SUPABASE_SERVICE_ROLE_KEY`, a fresh salt and IV per value),
and decrypted only in server code at the moment it is used:

| Where | What |
|---|---|
| `mcp_installations.config` | connector fields declared `secret` |
| `custom_connectors.token_enc`, `oauth_clients.client_secret_enc`, `oauth_connections.*_token_enc` | connector tokens and OAuth secrets |
| `telegram_settings.bot_token_encrypted`, `.shared_api_key_encrypted`, `.webhook_secret`, `telegram_links.api_key_encrypted` | Telegram |
| `memory_settings.embedder_api_key` | the embedder's API key |
| `workflow_triggers.secret` | a webhook trigger's token / HMAC signing key (shown to the trigger's owner only) |

Reads also accept a value written before it was encrypted, so an upgrade is safe in any
order. After upgrading, encrypt what is already stored (counts only, never prints a value):

```bash
node scripts/secrets-backfill.mjs --env-file .env.local            # dry run
node scripts/secrets-backfill.mjs --env-file .env.local --apply    # encrypt
node scripts/secrets-backfill.mjs --env-file .env.local --verify   # exit 1 if anything is left
```

Because the key is derived from `SUPABASE_SERVICE_ROLE_KEY`, **rotating the service-role key
makes every stored secret unreadable** — re-enter them (or decrypt with the old key and
re-encrypt) when you rotate it. Keep a copy of the key outside the database server.
One-way hashes (`api_keys.key_hash`) are not reversible and stay as they are.

## Per-user isolation (row-level security)

Every Lucy table has RLS enabled with policies keyed to the signed-in user, so one
account can never read another's data:

```sql
create policy "Users can manage own conversations" on conversations
  for all using (auth.uid() = user_id);
```

The same pattern covers messages, provider configs, preferences, workflows,
runs, screenings, devices, and profiles. The browser uses the **anon key** and is
bound by these policies; only server routes that hold the **service-role key** can
cross user boundaries — and that key is server-only, never shipped to the client.

## Email delivery

Transactional email (password-reset and email-2FA codes) goes out over **SMTP**
via nodemailer, configured with `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` /
`SMTP_PASS` / `SMTP_FROM_EMAIL`. Port 587 uses STARTTLS; set `SMTP_SECURE=ssl` for
465. If SMTP isn't configured, sends are **skipped gracefully** rather than
erroring — but password reset and email 2FA then have no way to deliver, so
configure SMTP if you rely on them.

## Untrusted content: links, workflow code, e-mail, desktop app

Anything written by a model or another person is treated as untrusted:

- **Chat links.** Markdown in chat is rendered without raw HTML. Only `http`, `https`
  and `mailto` links are clickable (opened in a new tab with
  `noopener noreferrer nofollow`); `javascript:`, `data:`, relative and unparsable
  targets show as plain text.
- **Workflow Code steps run on the server only.** The visual builder never executes
  user-written JavaScript in the browser. In standalone mode a Code step stops with
  "Code steps run only on the server"; in connected mode the run happens on the
  server, where Code steps are additionally refused on shared hosts
  (`WORKFLOW_MULTI_TENANT=1`).
- **E-mail.** Names and codes are HTML-escaped before they go into the HTML part of
  an e-mail.
- **Content Security Policy.** Production pages are served without `'unsafe-eval'`
  (`next dev` still allows it).
- **Desktop app.** The window only ever shows the bundled local server. Links and
  redirects to any other site open in the system browser, and only `http`, `https`
  and `mailto` URLs are ever handed to the operating system.
