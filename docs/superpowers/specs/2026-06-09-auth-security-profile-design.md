# Auth, Security & Profile — Design Spec

**Status:** Approved (design) · **Date:** 2026-06-09 · **Owner:** Johnny
**Umbrella:** `2026-06-09-lucy-design-overhaul-vision.md` (sub-project #2) · **Branch:** `feat/auth-security-profile`

## Goal

Port Contractors Room's (CTR) security stack into Lucy at full parity (minus KYC): custom
code-based **password recovery**, **two-factor auth** (authenticator-app TOTP *and* email
one-time code), **device/session tracking**, and the **Profile + Security** pages (filling
the scaffolds shipped in sub-project #1). Fix registration so **company** is optional and
actually persisted. CTR is Next.js 12 (Pages Router); Lucy is Next.js 14 (App Router) — this
re-implements the *logic*, not a file copy.

## Decisions (resolved during brainstorming)
- **Email sender:** reuse the working Zoho transport (`smtp.zoho.eu`, `contact@brand.contractors`),
  branded as **Lucy**. Credentials live in Lucy `.env.local` (seeded from the shared
  `contractors_room.settings`), so Lucy is self-contained — no cross-schema runtime coupling.
- **2FA scope:** full parity — **TOTP** (Supabase MFA) **and** **email-OTP** at login.
- **Tables:** new **`lucy`-schema** tables, decoupled from CTR (CTR's `provisionVerifiedUser`
  assigns contractor/client roles Lucy doesn't want).

## Current state (Lucy)
- Auth via `@supabase/ssr`; `lib/supabase/auth.tsx` exposes `signIn/signUp/signOut/resetPassword/signInWithGoogle`.
  `signUp(email, password)` drops the collected company (known bug). `app/auth/{login,signup,forgot-password}`
  exist; `forgot-password` uses Supabase's native `resetPasswordForEmail`.
- `middleware.ts` protects `/chat`,`/workflows`,`/settings`; redirects to `/auth/login?redirectTo=`.
- No email-sending code; no `nodemailer` dependency.
- Sub-project #1 left scaffolds at `app/settings/profile` (company field) and `app/settings/security`
  (coming-soon stubs).

---

## 1. Data layer — new `lucy` tables

`lib/supabase/auth_security.sql` (apply after `schema.sql`):

- **`lucy.email_verification_codes`** — `id uuid pk`, `user_id uuid → auth.users on delete cascade`,
  `email text`, `code_hash text` (scrypt `salt:dk`), `purpose text` (`'reset' | '2fa'`),
  `attempts int default 0`, `expires_at timestamptz`, `consumed_at timestamptz`, `created_at timestamptz default now()`.
  RLS: **service-role only** (no client access; all access via server route handlers).
  Index on `(user_id, purpose)`.
- **`lucy.member_devices`** — `id bigserial pk`, `user_id uuid → auth.users`, `device_name text`,
  `device_type text`, `browser text`, `os text`, `ip_address text`, `fingerprint text`,
  `is_current bool default false`, `last_active_at timestamptz default now()`, `created_at timestamptz default now()`.
  RLS: user `select`/`delete` own rows (`auth.uid() = user_id`); inserts/updates via service-role route.
  Unique on `(user_id, fingerprint)`.
- **`lucy.user_profiles`** — `user_id uuid pk → auth.users on delete cascade`, `display_name text`,
  `company text`, `avatar_url text`, `two_factor_email_enabled bool default false`,
  `created_at timestamptz default now()`, `updated_at timestamptz default now()`.
  RLS: user `select`/`update`/`insert` own row. TOTP-enabled state is NOT stored here — it's
  derived from Supabase MFA factors (`auth.mfa.listFactors`).

Constants (ported): `CODE_TTL_MINUTES = 15`, `MAX_ATTEMPTS = 5`. Codes are 6 digits, scrypt-hashed
with a per-code 16-byte salt, compared with `timingSafeEqual`.

**Company migration:** the profile page + onboarding currently read/write `companyName` in
`lucy.user_preferences`. Going forward, company lives in `lucy.user_profiles`. The implementation
migrates existing `user_preferences.companyName` values into `user_profiles.company` and repoints
the profile/onboarding reads/writes. (Small, one-time.)

## 2. Email foundation — `lib/email/` (self-contained)

- **`lib/email/smtp.ts`** — `getTransport()`: builds a cached `nodemailer` transport from env:
  `SMTP_HOST`, `SMTP_PORT` (587), `SMTP_SECURE` (`tls`), `SMTP_USER`, `SMTP_PASS`,
  `SMTP_FROM_NAME` ("Lucy"), `SMTP_FROM_EMAIL` (`contact@brand.contractors`). These are seeded into
  `.env.local` during implementation from the known-working Zoho creds (never committed). **Secure
  mapping:** `tls` → nodemailer `secure:false` + STARTTLS (port 587, Zoho's config); `ssl` →
  `secure:true` (port 465). Never set `secure:true` on 587.
- **`lib/email/templates.ts`** — `renderEmail(key, vars)` → `{ subject, html, text }` for
  `passwordReset` and `twoFactorCode`, vars `{ firstName, code, expiresMinutes }`. Lucy-branded
  (purple `lucy-` palette), plain + HTML.
- **`lib/email/codes.ts`** — ported scrypt logic over `lucy.email_verification_codes`:
  - `createCode(email, purpose): Promise<{ status:'sent'; code } | { status:'not_found' }>` — looks up
    the user by email (service-role), mints + hashes a 6-digit code, inserts a row.
  - `confirmCode(email, code, purpose): Promise<{ ok:true } | { ok:false; reason:'no_code'|'expired'|'too_many'|'mismatch' }>` —
    verifies, increments attempts, marks consumed.
  - `hashCode`/`checkCode` (scrypt + `timingSafeEqual`).
- **`lib/email/send.ts`** — `sendTemplateEmail(to, key, vars)`: transport + render + send; skips obvious
  test domains. Errors are logged and surfaced as a soft failure (the request route still returns ok
  to avoid enumeration on reset).
- Dependency: add `nodemailer` (+ `@types/nodemailer`).

## 3. Auth flows (App Router)

**Password recovery (custom code):**
- `app/auth/forgot-password/page.tsx` — repoint to `POST /api/auth/reset/request` `{ email }` →
  redirect to `/auth/reset-password?email=…`.
- `app/auth/reset-password/page.tsx` (new) — 6-digit code + new password (≥8, confirm) →
  `POST /api/auth/reset/confirm`; resend cooldown 30s; on success → `/auth/login`.
- `app/api/auth/reset/request/route.ts` — `createCode(email,'reset')` + `sendTemplateEmail('passwordReset')`.
  Always `{ ok:true }` (no account enumeration). Rate-limited via `lib/api/rate-limit.ts`.
- `app/api/auth/reset/confirm/route.ts` — `confirmCode(email,code,'reset')` then
  service-role `auth.admin.updateUserById(userId, { password })`. Returns `{ ok, reason? }`.

**TOTP 2FA (Supabase MFA):**
- `app/auth/two-factor-setup/page.tsx` (new) — `supabase.auth.mfa.enroll({ factorType:'totp' })` →
  render `qr_code` + manual `secret` → user enters code → `challenge` + `verify` → enrolled. Launched
  from the Security page.
- `app/auth/two-factor-challenge/page.tsx` (new) — login-time TOTP: `listFactors` → `challenge` →
  `verify`; 5 wrong attempts → `/auth/account-locked` (new minimal page) then sign-out.

**Email-OTP 2FA:**
- `app/api/auth/2fa/request/route.ts` — authenticated; `createCode(email,'2fa')` +
  `sendTemplateEmail('twoFactorCode')`.
- `app/api/auth/2fa/verify/route.ts` — authenticated; `confirmCode(email,code,'2fa')` → `{ ok }`.
- `app/auth/2fa/page.tsx` (new) — email-OTP challenge screen at login (request-on-mount + verify).

**Login gate:**
- `lib/auth/twofa-session.ts` — `set2faPassed(userId)`/`is2faPassed(userId)`/`clear2faPassed()`
  (sessionStorage key `lucy-2fa-passed`, per-tab; ported from CTR `utils/twofa.ts`).
- `app/auth/login/page.tsx` — after `signInWithPassword`: if a TOTP factor is enrolled
  (`mfa.listFactors`) → `/auth/two-factor-challenge`; else if `user_profiles.two_factor_email_enabled`
  → `/auth/2fa`; else `/chat`. Both challenge screens call `set2faPassed` on success then proceed
  (honoring `redirectTo`). `signOut` clears the flag.

**Registration fix:**
- `app/auth/signup/page.tsx` — keep the optional company field; pass `{ company }` (and optional
  `display_name`) into `signUp`. Single-role (no client/contractor — Lucy never had it).
- `lib/supabase/auth.tsx` — `signUp(email, password, metadata?)` forwards metadata to Supabase
  `options.data`; on first authenticated load, upsert `lucy.user_profiles` from that metadata
  (so company is persisted even though signup precedes email confirmation).

## 4. Device tracking + pages

- `lib/auth/device.ts` — `deviceFingerprint()` (hash of UA + language + screen + timezone),
  `fetchIp()` (ipify), and a `trackDevice()` that calls `POST /api/auth/devices/track`.
  Called from the AuthProvider on successful login.
- `app/api/auth/devices/track/route.ts` — upsert into `lucy.member_devices` by `(user_id,fingerprint)`;
  set `is_current=true` for this device, `false` for others; service-role.
- `app/api/auth/devices/route.ts` — `GET` (list current user's devices, RLS-scoped) and
  `DELETE ?id=` (remove a device/session).
- `app/settings/security/page.tsx` (fill scaffold) — **Change password** (inline form →
  `supabase.auth.updateUser({ password })`), **TOTP 2FA** enable (→ `/auth/two-factor-setup`) /
  disable (`mfa.unenroll`), **Email 2FA** toggle (writes `user_profiles.two_factor_email_enabled`),
  **Devices** list with remove. Uses existing `Card/Button/Badge/Input`.
- `app/settings/profile/page.tsx` (fill scaffold) — display name, avatar URL, company (optional),
  email (read-only); reads/writes `lucy.user_profiles`.

## 5. Phasing (one plan, three build phases)

- **Phase A — Email + Password Recovery + Registration fix:** the 3 tables, `lib/email/*`,
  `/api/auth/reset/*`, `forgot-password` rewire + `reset-password` page, signup company-persist +
  `user_profiles`, company migration. *Independently shippable & immediately useful.*
- **Phase B — 2FA:** TOTP setup/challenge pages + Supabase MFA, email-OTP routes + `/auth/2fa`,
  login gate + `twofa-session`, Security-page 2FA controls, `two_factor_email_enabled`, account-locked.
- **Phase C — Device tracking + Profile/Security polish:** `member_devices` plumbing, devices API,
  Security device list, Profile fields (name/avatar).

## 6. Security considerations
- Reset codes: scrypt-hashed, 15-min TTL, 5-attempt cap, single-use (`consumed_at`), no account
  enumeration (request always returns ok), rate-limited.
- Reset password change uses service-role `admin.updateUserById` strictly after `confirmCode` passes.
- TOTP via Supabase MFA reaches AAL2; email-OTP is the weaker fallback (parity).
- Email-OTP request/verify routes require an authenticated session (the code is sent to *their* email).
- 2FA gate is client-side (sessionStorage) for parity; **server-side cookie enforcement is noted as
  later hardening** (out of scope here).
- SMTP secrets only in `.env.local` (gitignored). Device IP via ipify (third-party) — acceptable;
  documented.

## 7. Testing
- Unit (Jest): `lib/email/codes.ts` — scrypt `hashCode`/`checkCode` round-trip, TTL expiry,
  attempt-cap, purpose isolation, single-use. Reset `confirm` reason mapping.
- Manual: full walkthroughs — forgot→reset, TOTP enroll→logout→login challenge, email-2FA toggle→login,
  signup persists company, device appears + removable.
- `npx tsc --noEmit`, `npm run lint`, `npm run build` green per phase.

## 8. Excluded / deferred
- KYC / Didit (entirely).
- Supabase signup **email confirmation** stays native (not ported to custom codes).
- Server-side 2FA cookie enforcement (later hardening).
- Avatar *upload* (we store an avatar URL; file upload/storage is a later polish).
