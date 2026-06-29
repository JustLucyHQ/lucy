# Security Hardening — 2026-06-10

Fixes from the project-wide security audit. **Branch:** `feat/security-hardening`.

## 1. Screening API tenant scoping (High)

**Was:** `GET /api/screening` (list) and `GET/POST /api/screening/[id]` validated the Lucy API key but then queried with the service-role client (RLS bypassed) and **no ownership filter** — any key holder could read every tenant's screenings, contractor PII, grades, and answers.

**Now:** `getScreening`, `listScreenings`, and `submitAnswers` accept an `ownerId` and the routes pass the authenticated key's `user_id`; rows created by other users return 404 / are omitted. `startScreening` already recorded `created_by`.

**Note:** legacy rows with `created_by = null` (created before `screening_rls_fix.sql`) are no longer visible through the API. Backfill if needed:
`update lucy.screenings set created_by = '<admin-user-uuid>' where created_by is null;`

## 2. Server-side 2FA enforcement (High)

**Was:** the 2FA "gate" was a client-side `sessionStorage` flag. Navigating directly to `/chat` after a password login skipped 2FA entirely.

**Now (`proxy.ts`):**
- **TOTP:** the proxy checks `supabase.auth.mfa.getAuthenticatorAssuranceLevel()`. A user with a verified TOTP factor whose session is still AAL1 is redirected to `/auth/two-factor-challenge`. (Supabase upgrades the session to AAL2 only after `mfa.verify`.)
- **Email-OTP:** `/api/auth/2fa/verify` now sets an HMAC-SHA256-signed, httpOnly `lucy_2fa` cookie (12h TTL, keyed from `SUPABASE_SERVICE_ROLE_KEY`) on success. The proxy verifies it (`lib/auth/twofa-cookie.ts`) and, when absent/invalid, checks `user_profiles.two_factor_email_enabled` and redirects to `/auth/2fa`. The profile query only runs when the cookie is missing, so steady-state cost is one HMAC per page navigation.
- The `sessionStorage` flag remains as client-side UX only.

Unit tests: `__tests__/lib/auth/twofa-cookie.test.ts` (7 tests).

## 3. Provider API keys: XOR → AES-256-GCM (High)

**Was:** `lucy.provider_configs.api_key_encrypted` held XOR-"obfuscated" keys with the public salt `lucy_api_key_v1` — plaintext-equivalent for anyone with DB read access. The browser adapter wrote rows directly.

**Now:**
- New route `POST/GET /api/provider-keys` (session or Lucy API key auth via `resolveMemoryAuth`; userId never read from the body). Writes encrypt with AES-256-GCM (`lib/auth/provider-keys.ts`, reusing `lib/mcp/secret.ts`, keyed from `SUPABASE_SERVICE_ROLE_KEY`); stored format `enc:v1:iv:tag:ct`.
- `SupabaseStorageAdapter` now calls this route instead of touching the table.
- Server-side readers (`app/api/chat/route.ts`, `lib/screening/index.ts`) use `decryptProviderKey()`, which **also reads legacy XOR rows**; legacy rows are re-encrypted opportunistically on GET. No manual migration needed.
- Standalone mode (localStorage) is unchanged — keys there remain local to the user's own browser.

Unit tests: `__tests__/lib/auth/provider-keys.test.ts` (6 tests).

## 4. `/api/chat` no longer trusts body `userId` (Medium)

Project-context injection used the request body's `userId`. The route now resolves identity **once** server-side (session cookie or Lucy API key) into `authUserId` and uses it for project context, the env-key gate, and MCP tools. The `userId` body field is ignored.

## 5. Server env API keys gated behind auth (Medium)

**Was:** any anonymous visitor could stream chat on the server's `OPENAI_API_KEY` (etc.) — only per-IP rate limiting stood in the way.

**Now:** in connected mode (Supabase configured) the env-key fallback applies only to authenticated callers. Header-supplied keys (`x-openai-key` — the embed-widget path) and standalone mode are unchanged.

## 6. Admin gate is now role-based (Medium) — superseded same day

The `LUCY_ADMIN_EMAIL` env gate (and its everyone-is-admin fallback) was replaced with a per-user **admin role** stored in Supabase auth `app_metadata.lucy_role` — writable only via the service-role admin API, managed from the Admin panel ("Users & roles"), with a last-admin lockout guard. Fresh deployments auto-promote one deterministic first admin (a `LUCY_ADMIN_EMAIL` match if that legacy env is still set, otherwise the oldest account). See `lib/auth/admin.ts` and `/api/admin/roles`.

## Accepted / deferred

- **proxy fail-open** on middleware errors — kept deliberately (availability over lockout); revisit if Lucy hosts higher-sensitivity data.
- **Password-reset timing-based user enumeration** — low signal, deferred.
- **2FA code brute-force window** — codes are scrypt-hashed, 5 attempts per code, 15-min TTL; per-IP rate limit on the request endpoint. Acceptable.
- **npm audit moderates** — inside Next.js's bundled postcss; upstream.

## Verification

- 207 tests / 31 suites pass (13 new); `tsc` clean; lint 0 errors; production build OK.
- Live: anonymous `/api/chat` refused env-key fallback; `/api/screening` and `/api/provider-keys` return 401 anonymously; protected pages 307-redirect to login.
