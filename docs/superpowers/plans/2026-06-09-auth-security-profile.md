# Auth, Security & Profile — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port CTR's security stack into Lucy at full parity (minus KYC): custom code password recovery, 2FA (TOTP + email-OTP), device tracking, Profile/Security pages, and a registration company-persist fix.

**Architecture:** A self-contained `lib/email/` (nodemailer over Zoho, scrypt-hashed codes in a new `lucy.email_verification_codes` table) powers password reset + email-OTP. TOTP uses Supabase MFA. New `lucy` tables (`email_verification_codes`, `member_devices`, `user_profiles`) keep Lucy decoupled from CTR. App Router route handlers + auth pages wire it together; a sessionStorage flag gates 2FA at login.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind (`lucy-` palette), `@supabase/ssr` + `@supabase/supabase-js`, `nodemailer`, Node `crypto` (scrypt), Jest, self-hosted Supabase (docker `supabase-db`).

**Spec:** `docs/superpowers/specs/2026-06-09-auth-security-profile-design.md` · **Branch:** `feat/auth-security-profile`

---

## Conventions
- Verify each task: `npx tsc --noEmit` and (for routes/pages) `npm run build`. Jest: `npx jest <path>`.
- DB changes apply to the self-hosted Supabase: `docker exec -i supabase-db psql -U supabase_admin -d postgres` (the `postgres` role lacks CREATE on the `lucy` schema — use `supabase_admin`). Save SQL to a file too.
- `.env.local` is gitignored and holds real secrets — **NEVER commit it, never echo secret values to the terminal.**
- Commit per task; trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Do NOT push.
- Keep `Card/Button/Badge/Input`, the `lucy-` palette, and the AppShell/settings sub-route structure. The Security + Profile pages already exist as scaffolds at `app/settings/security/page.tsx` and `app/settings/profile/page.tsx`.
- Existing auth pages to match for style: `app/auth/login/page.tsx`, `app/auth/forgot-password/page.tsx`.

## File map
- **Create:** `lib/supabase/auth_security.sql`, `lib/email/smtp.ts`, `lib/email/templates.ts`, `lib/email/codes.ts`, `lib/email/send.ts`, `lib/auth/twofa-session.ts`, `lib/auth/device.ts`, `__tests__/lib/email/codes.test.ts`, `app/api/auth/reset/request/route.ts`, `app/api/auth/reset/confirm/route.ts`, `app/api/auth/2fa/request/route.ts`, `app/api/auth/2fa/verify/route.ts`, `app/api/auth/devices/track/route.ts`, `app/api/auth/devices/route.ts`, `app/auth/reset-password/page.tsx`, `app/auth/2fa/page.tsx`, `app/auth/two-factor-setup/page.tsx`, `app/auth/two-factor-challenge/page.tsx`, `app/auth/account-locked/page.tsx`.
- **Modify:** `.env.local` (SMTP, not committed), `package.json` (nodemailer), `app/auth/forgot-password/page.tsx`, `app/auth/signup/page.tsx`, `app/auth/login/page.tsx`, `lib/supabase/auth.tsx`, `app/settings/security/page.tsx`, `app/settings/profile/page.tsx`.

---

# PHASE A — Email foundation + Password Recovery + Registration fix

### Task A1: Create the three `lucy` tables

**Files:** Create `lib/supabase/auth_security.sql`

- [ ] **Step 1: Write the SQL file**
```sql
-- lib/supabase/auth_security.sql  — apply after schema.sql, as supabase_admin
set search_path to lucy, public;

create table if not exists lucy.email_verification_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  code_hash text not null,            -- scrypt 'salt:dk'
  purpose text not null,              -- 'reset' | '2fa'
  attempts int not null default 0,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists evc_user_purpose_idx on lucy.email_verification_codes(user_id, purpose);
alter table lucy.email_verification_codes enable row level security;
-- service-role only: no policies => clients cannot read/write; route handlers use the service client.

create table if not exists lucy.member_devices (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_name text,
  device_type text,
  browser text,
  os text,
  ip_address text,
  fingerprint text not null,
  is_current boolean not null default false,
  last_active_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, fingerprint)
);
alter table lucy.member_devices enable row level security;
create policy member_devices_select_own on lucy.member_devices for select using (auth.uid() = user_id);
create policy member_devices_delete_own on lucy.member_devices for delete using (auth.uid() = user_id);
-- inserts/updates happen via the service client in the track route.

create table if not exists lucy.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  company text,
  avatar_url text,
  two_factor_email_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table lucy.user_profiles enable row level security;
create policy user_profiles_select_own on lucy.user_profiles for select using (auth.uid() = user_id);
create policy user_profiles_insert_own on lucy.user_profiles for insert with check (auth.uid() = user_id);
create policy user_profiles_update_own on lucy.user_profiles for update using (auth.uid() = user_id);

-- one-time company migration from user_preferences (best-effort; ignore if column/table differ)
insert into lucy.user_profiles (user_id, company)
select user_id, company_name from lucy.user_preferences
where company_name is not null and company_name <> ''
on conflict (user_id) do update set company = excluded.company
where lucy.user_profiles.company is null;

notify pgrst, 'reload schema';
```
NOTE: confirm the `user_preferences` company column name first — run `docker exec -i supabase-db psql -U supabase_admin -d postgres -c "\d lucy.user_preferences"`. If the column is `companyname`/`company` not `company_name`, fix the migration line accordingly. If the column genuinely doesn't exist, drop the migration `insert` (the company-persist will still work going forward).

- [ ] **Step 2: Apply it**
Run: `docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < lib/supabase/auth_security.sql`
Expected: no errors; ends with `NOTIFY`. Verify: `docker exec -i supabase-db psql -U supabase_admin -d postgres -tAc "select table_name from information_schema.tables where table_schema='lucy' and table_name in ('email_verification_codes','member_devices','user_profiles') order by 1"` → prints all three.

- [ ] **Step 3: Commit** (SQL file only)
```bash
git add lib/supabase/auth_security.sql
git commit -m "feat(auth): lucy schema tables for codes, devices, profiles"
```

### Task A2: Seed SMTP config into `.env.local` (NOT committed)

**Files:** Modify `.env.local`

- [ ] **Step 1:** Read the working Zoho password from the shared settings (do NOT echo it):
```bash
PW=$(docker exec -i supabase-db psql -U supabase_admin -d postgres -tAc "select value from contractors_room.settings where category='email' and key='smtp_password'")
```
- [ ] **Step 2:** Append the SMTP block to `.env.local` only if not already present (uses `$PW`, never printed):
```bash
cd /c/RepositoryAI/LucyAI
grep -q '^SMTP_HOST=' .env.local || cat >> .env.local <<EOF

# Email (Zoho) — security emails, branded Lucy
SMTP_HOST=smtp.zoho.eu
SMTP_PORT=587
SMTP_SECURE=tls
SMTP_USER=contact@brand.contractors
SMTP_PASS=$PW
SMTP_FROM_NAME=Lucy
SMTP_FROM_EMAIL=contact@brand.contractors
EOF
echo "SMTP_* present in .env.local: $(grep -c '^SMTP_' .env.local) keys"
```
Expected: "7 keys". **Confirm `.env.local` is gitignored** (`git check-ignore .env.local` prints the path). Do NOT `git add .env.local`.
- [ ] **Step 3:** No commit (env is untracked). Report the key count only.

### Task A3: Add nodemailer

**Files:** Modify `package.json`

- [ ] **Step 1:** `npm install nodemailer && npm install -D @types/nodemailer`
- [ ] **Step 2:** Verify `npx tsc --noEmit` still clean.
- [ ] **Step 3: Commit**
```bash
git add package.json package-lock.json
git commit -m "build(auth): add nodemailer for security emails"
```

### Task A4: `lib/email/smtp.ts`

**Files:** Create `lib/email/smtp.ts`

- [ ] **Step 1: Implement**
```ts
import nodemailer, { Transporter } from 'nodemailer';

let cached: { key: string; tx: Transporter } | null = null;

export interface SmtpConfig {
  host: string; port: number; secure: boolean; requireTLS: boolean;
  user: string; pass: string; fromName: string; fromEmail: string;
}

export function loadSmtpConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  const port = Number(process.env.SMTP_PORT ?? 587);
  // 'ssl' => secure:true (465); 'tls'/'none' => secure:false + STARTTLS (587). NEVER secure:true on 587.
  const mode = (process.env.SMTP_SECURE ?? 'tls').toLowerCase();
  const secure = mode === 'ssl';
  return {
    host, port, secure, requireTLS: !secure,
    user, pass,
    fromName: process.env.SMTP_FROM_NAME ?? 'Lucy',
    fromEmail: process.env.SMTP_FROM_EMAIL ?? user,
  };
}

/** Cached transport, or null when SMTP isn't configured (callers degrade gracefully). */
export function getTransport(): { tx: Transporter; cfg: SmtpConfig } | null {
  const cfg = loadSmtpConfig();
  if (!cfg) return null;
  const key = `${cfg.host}:${cfg.port}:${cfg.secure}:${cfg.user}`;
  if (!cached || cached.key !== key) {
    cached = {
      key,
      tx: nodemailer.createTransport({
        host: cfg.host, port: cfg.port, secure: cfg.secure, requireTLS: cfg.requireTLS,
        auth: { user: cfg.user, pass: cfg.pass },
      }),
    };
  }
  return { tx: cached.tx, cfg };
}
```
- [ ] **Step 2:** `npx tsc --noEmit` clean. Commit:
```bash
git add lib/email/smtp.ts
git commit -m "feat(email): nodemailer transport from env (Zoho, STARTTLS-safe)"
```

### Task A5: `lib/email/templates.ts`

**Files:** Create `lib/email/templates.ts`

- [ ] **Step 1: Implement** (Lucy-branded; `passwordReset` + `twoFactorCode`)
```ts
export interface CodeVars { firstName: string; code: string; expiresMinutes: number; }
export interface RenderedEmail { subject: string; html: string; text: string; }
export type TemplateKey = 'passwordReset' | 'twoFactorCode';

const wrap = (heading: string, body: string) => `
<div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111">
  <div style="font-size:20px;font-weight:700;color:#7c3aed;margin-bottom:16px">Lucy</div>
  <h1 style="font-size:18px;margin:0 0 12px">${heading}</h1>
  ${body}
  <p style="font-size:12px;color:#888;margin-top:24px">If you didn't request this, you can ignore this email.</p>
</div>`;

const codeBlock = (code: string) =>
  `<div style="font-size:30px;letter-spacing:8px;font-weight:700;background:#f5f3ff;color:#5b21b6;
   padding:14px;border-radius:10px;text-align:center;margin:8px 0">${code}</div>`;

export function renderEmail(key: TemplateKey, vars: CodeVars): RenderedEmail {
  const { firstName, code, expiresMinutes } = vars;
  if (key === 'passwordReset') {
    return {
      subject: 'Reset your Lucy password',
      html: wrap('Reset your password',
        `<p>Hi ${firstName}, use this code to reset your password. It expires in ${expiresMinutes} minutes.</p>${codeBlock(code)}`),
      text: `Hi ${firstName}, your Lucy password reset code is ${code} (expires in ${expiresMinutes} minutes).`,
    };
  }
  return {
    subject: 'Your Lucy verification code',
    html: wrap('Your verification code',
      `<p>Hi ${firstName}, here is your sign-in code. It expires in ${expiresMinutes} minutes.</p>${codeBlock(code)}`),
    text: `Hi ${firstName}, your Lucy sign-in code is ${code} (expires in ${expiresMinutes} minutes).`,
  };
}
```
- [ ] **Step 2:** `npx tsc --noEmit` clean. Commit:
```bash
git add lib/email/templates.ts
git commit -m "feat(email): Lucy-branded passwordReset + twoFactorCode templates"
```

### Task A6: `lib/email/codes.ts` (TDD — scrypt + verdict logic)

**Files:** Create `lib/email/codes.ts`; Test `__tests__/lib/email/codes.test.ts`

- [ ] **Step 1: Write the failing test**
```ts
// __tests__/lib/email/codes.test.ts
import { hashCode, checkCode, evaluateCode, MAX_ATTEMPTS, CODE_TTL_MINUTES } from '@/lib/email/codes';

describe('code hashing', () => {
  it('round-trips a code (different salt each time)', () => {
    const h1 = hashCode('123456');
    const h2 = hashCode('123456');
    expect(h1).not.toEqual(h2);             // per-code salt
    expect(checkCode('123456', h1)).toBe(true);
    expect(checkCode('000000', h1)).toBe(false);
  });
});

describe('evaluateCode', () => {
  const now = 1_000_000_000_000;
  const good = (over: Partial<any> = {}) => ({
    code_hash: hashCode('111222'), attempts: 0,
    expires_at: new Date(now + 60_000).toISOString(), consumed_at: null, ...over,
  });
  it('no_code when row missing or already consumed', () => {
    expect(evaluateCode(null, '111222', now)).toEqual({ ok: false, reason: 'no_code' });
    expect(evaluateCode(good({ consumed_at: new Date(now).toISOString() }), '111222', now)).toEqual({ ok: false, reason: 'no_code' });
  });
  it('expired when past expires_at', () => {
    expect(evaluateCode(good({ expires_at: new Date(now - 1).toISOString() }), '111222', now)).toEqual({ ok: false, reason: 'expired' });
  });
  it('too_many at the attempt cap', () => {
    expect(evaluateCode(good({ attempts: MAX_ATTEMPTS }), '111222', now)).toEqual({ ok: false, reason: 'too_many' });
  });
  it('mismatch on wrong code, ok on right code', () => {
    expect(evaluateCode(good(), '999999', now)).toEqual({ ok: false, reason: 'mismatch' });
    expect(evaluateCode(good(), '111222', now)).toEqual({ ok: true });
  });
  it('exposes the ported constants', () => {
    expect(MAX_ATTEMPTS).toBe(5);
    expect(CODE_TTL_MINUTES).toBe(15);
  });
});
```
- [ ] **Step 2: Run, verify fail**
Run: `npx jest __tests__/lib/email/codes.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement**
```ts
// lib/email/codes.ts
import { randomBytes, randomInt, scryptSync, timingSafeEqual } from 'crypto';

export const CODE_TTL_MINUTES = 15;
export const MAX_ATTEMPTS = 5;

export function hashCode(code: string): string {
  const salt = randomBytes(16).toString('hex');
  const dk = scryptSync(code, salt, 32).toString('hex');
  return `${salt}:${dk}`;
}
export function checkCode(code: string, stored: string): boolean {
  const [salt, dk] = stored.split(':');
  if (!salt || !dk) return false;
  const a = Buffer.from(dk, 'hex');
  const b = scryptSync(code, salt, 32);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type Purpose = 'reset' | '2fa';
export type Verdict = { ok: true } | { ok: false; reason: 'no_code' | 'expired' | 'too_many' | 'mismatch' };
export interface CodeRow { code_hash: string; attempts: number; expires_at: string; consumed_at: string | null; }

/** Pure verdict — DB-free, fully unit-tested. */
export function evaluateCode(row: CodeRow | null, code: string, nowMs: number): Verdict {
  if (!row || row.consumed_at) return { ok: false, reason: 'no_code' };
  if (Date.parse(row.expires_at) < nowMs) return { ok: false, reason: 'expired' };
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false, reason: 'too_many' };
  if (!checkCode(code, row.code_hash)) return { ok: false, reason: 'mismatch' };
  return { ok: true };
}

export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/** DB ops use the service-role client (SupabaseClient with the lucy schema). */
import type { SupabaseClient } from '@supabase/supabase-js';

export async function createCode(
  client: SupabaseClient<any, any, any>, userId: string, email: string, purpose: Purpose
): Promise<string> {
  const code = generateCode();
  const expires = new Date(Date.now() + CODE_TTL_MINUTES * 60_000).toISOString();
  await client.from('email_verification_codes').insert({
    user_id: userId, email, code_hash: hashCode(code), purpose, expires_at: expires,
  });
  return code;
}

export async function confirmCode(
  client: SupabaseClient<any, any, any>, userId: string, code: string, purpose: Purpose
): Promise<Verdict> {
  const { data } = await client
    .from('email_verification_codes')
    .select('id, code_hash, attempts, expires_at, consumed_at')
    .eq('user_id', userId).eq('purpose', purpose).is('consumed_at', null)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  const verdict = evaluateCode((data as CodeRow) ?? null, code, Date.now());
  if (!data) return verdict;
  if (verdict.ok) {
    await client.from('email_verification_codes').update({ consumed_at: new Date().toISOString() }).eq('id', (data as any).id);
  } else if (verdict.reason === 'mismatch') {
    await client.from('email_verification_codes').update({ attempts: (data as any).attempts + 1 }).eq('id', (data as any).id);
  }
  return verdict;
}
```
- [ ] **Step 4: Run, verify pass**
Run: `npx jest __tests__/lib/email/codes.test.ts` → PASS (all). Then `npx tsc --noEmit` clean.
- [ ] **Step 5: Commit**
```bash
git add lib/email/codes.ts __tests__/lib/email/codes.test.ts
git commit -m "feat(email): scrypt code create/confirm with TDD'd verdict logic"
```

### Task A7: `lib/email/send.ts`

**Files:** Create `lib/email/send.ts`

- [ ] **Step 1: Implement**
```ts
import { getTransport } from './smtp';
import { renderEmail, TemplateKey, CodeVars } from './templates';

/** Returns true if sent. Never throws — callers (e.g. reset request) must not leak failures. */
export async function sendTemplateEmail(to: string, key: TemplateKey, vars: CodeVars): Promise<boolean> {
  const t = getTransport();
  if (!t) { console.warn('[email] SMTP not configured; skipping send'); return false; }
  try {
    const { subject, html, text } = renderEmail(key, vars);
    await t.tx.sendMail({ from: `"${t.cfg.fromName}" <${t.cfg.fromEmail}>`, to, subject, html, text });
    return true;
  } catch (e) {
    console.error('[email] send failed:', e instanceof Error ? e.message : e);
    return false;
  }
}
```
- [ ] **Step 2:** `npx tsc --noEmit` clean. Commit:
```bash
git add lib/email/send.ts
git commit -m "feat(email): sendTemplateEmail (graceful, non-throwing)"
```

### Task A8: `POST /api/auth/reset/request`

**Files:** Create `app/api/auth/reset/request/route.ts`

First READ `lib/memory/auth.ts` to confirm the **service-role client** helper name (e.g. `serviceClient()`) and how it sets the `lucy` schema, and READ `lib/api/rate-limit.ts` for `checkRateLimit`/`getClientIp` signatures.

- [ ] **Step 1: Implement** (no account enumeration; rate-limited)
```ts
import { NextRequest } from 'next/server';
import { serviceClient } from '@/lib/memory/auth';        // confirm exact export
import { checkRateLimit, getClientIp } from '@/lib/api/rate-limit';
import { createCode, CODE_TTL_MINUTES } from '@/lib/email/codes';
import { sendTemplateEmail } from '@/lib/email/send';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!checkRateLimit('reset', ip, 5)) return Response.json({ ok: true }); // silent under rate limit
  const { email } = await req.json().catch(() => ({ email: '' }));
  if (typeof email !== 'string' || !email.includes('@')) return Response.json({ ok: true });

  const svc = serviceClient();
  if (svc) {
    // look up the user id by email via admin API (service-role)
    const { data } = await (svc as any).auth.admin.listUsers();
    const user = data?.users?.find((u: any) => (u.email ?? '').toLowerCase() === email.toLowerCase());
    if (user) {
      const code = await createCode(svc, user.id, email, 'reset');
      await sendTemplateEmail(email, 'passwordReset', {
        firstName: email.split('@')[0], code, expiresMinutes: CODE_TTL_MINUTES,
      });
    }
  }
  return Response.json({ ok: true }); // identical response whether or not the email exists
}
```
NOTE: if `serviceClient()` returns a client whose default schema is `lucy`, `from('email_verification_codes')` resolves correctly. Confirm; if it targets `public`, pass the lucy-schema client `createCode` expects. If `auth.admin.listUsers()` is unavailable on the helper, use the admin client construction already used elsewhere for service-role.
- [ ] **Step 2:** `npx tsc --noEmit` + `npm run build` clean.
- [ ] **Step 3: Commit**
```bash
git add app/api/auth/reset/request/route.ts
git commit -m "feat(auth): POST /api/auth/reset/request (emails a code, no enumeration)"
```

### Task A9: `POST /api/auth/reset/confirm`

**Files:** Create `app/api/auth/reset/confirm/route.ts`

- [ ] **Step 1: Implement**
```ts
import { NextRequest } from 'next/server';
import { serviceClient } from '@/lib/memory/auth';
import { confirmCode } from '@/lib/email/codes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { email, code, password } = await req.json().catch(() => ({}));
  if (typeof email !== 'string' || typeof code !== 'string' || typeof password !== 'string' || password.length < 8) {
    return Response.json({ ok: false, reason: 'mismatch' });
  }
  const svc = serviceClient();
  if (!svc) return Response.json({ ok: false, reason: 'no_code' });
  const { data } = await (svc as any).auth.admin.listUsers();
  const user = data?.users?.find((u: any) => (u.email ?? '').toLowerCase() === email.toLowerCase());
  if (!user) return Response.json({ ok: false, reason: 'no_code' });

  const verdict = await confirmCode(svc, user.id, code, 'reset');
  if (!verdict.ok) return Response.json(verdict);
  const { error } = await (svc as any).auth.admin.updateUserById(user.id, { password });
  if (error) return Response.json({ ok: false, reason: 'mismatch' });
  return Response.json({ ok: true });
}
```
- [ ] **Step 2:** `npx tsc --noEmit` + `npm run build` clean.
- [ ] **Step 3: Commit**
```bash
git add app/api/auth/reset/confirm/route.ts
git commit -m "feat(auth): POST /api/auth/reset/confirm (verify code + set password)"
```

### Task A10: reset-password page + forgot-password rewire

**Files:** Create `app/auth/reset-password/page.tsx`; Modify `app/auth/forgot-password/page.tsx`

- [ ] **Step 1:** READ `app/auth/forgot-password/page.tsx` to match its layout/markup. Rewire its submit to call the new endpoint instead of Supabase native:
```tsx
// inside handleSubmit, replace the resetPassword(email) call with:
await fetch('/api/auth/reset/request', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
});
router.push(`/auth/reset-password?email=${encodeURIComponent(email)}`);
```
(Keep the success state minimal; the redirect carries the email. Remove the now-unused `resetPassword` import if nothing else uses it.)
- [ ] **Step 2:** Create `app/auth/reset-password/page.tsx` matching the auth page style (centered card, `lucy-` accents):
```tsx
'use client';
import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function ResetForm() {
  const router = useRouter();
  const email = useSearchParams().get('email') ?? '';
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null);
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    if (password !== confirm) return setError('Passwords do not match.');
    setLoading(true);
    const res = await fetch('/api/auth/reset/confirm', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code, password }),
    });
    const json = await res.json(); setLoading(false);
    if (json.ok) { router.push('/auth/login'); return; }
    setError({ no_code: 'No active code — request a new one.', expired: 'Code expired — request a new one.',
      too_many: 'Too many attempts — request a new one.', mismatch: 'Invalid code.' }[json.reason as string] ?? 'Failed.');
  };

  return (
    <form onSubmit={submit} className="space-y-3 w-full max-w-sm">
      <h1 className="text-lg font-semibold text-white">Reset password</h1>
      <p className="text-xs text-gray-400">Enter the 6-digit code sent to {email || 'your email'} and a new password.</p>
      <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6} placeholder="123456"
        className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-2 text-gray-200 tracking-widest" />
      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password"
        className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-2 text-gray-200" />
      <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Confirm password"
        className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-2 text-gray-200" />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button disabled={loading} className="w-full bg-lucy-600 hover:bg-lucy-500 disabled:opacity-50 text-white rounded px-3 py-2 text-sm">
        {loading ? 'Resetting…' : 'Reset password'}
      </button>
    </form>
  );
}

export default function Page() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 p-4">
      <Suspense fallback={null}><ResetForm /></Suspense>
    </div>
  );
}
```
(`useSearchParams` requires the `Suspense` boundary for the build.)
- [ ] **Step 3:** `npx tsc --noEmit` + `npm run build` clean.
- [ ] **Step 4: Commit**
```bash
git add app/auth/reset-password/page.tsx app/auth/forgot-password/page.tsx
git commit -m "feat(auth): code-based reset-password page + forgot-password rewire"
```

### Task A11: Registration company-persist + profile upsert

**Files:** Modify `lib/supabase/auth.tsx`, `app/auth/signup/page.tsx`

- [ ] **Step 1:** READ `lib/supabase/auth.tsx`. Change `signUp` to accept optional metadata and forward it, and add a profile upsert on sign-in:
```ts
// signUp signature -> signUp(email, password, metadata?: { company?: string; display_name?: string })
// pass to supabase: client.auth.signUp({ email, password, options: { data: metadata ?? {} } })

// In the onAuthStateChange / session-load effect, when a user becomes available, upsert their profile:
async function ensureProfile(userId: string, meta: Record<string, any>) {
  await client.from('user_profiles').upsert(
    { user_id: userId, company: meta.company ?? null, display_name: meta.display_name ?? null },
    { onConflict: 'user_id', ignoreDuplicates: false }
  ).select(); // best-effort; ignore errors
}
```
NOTE: the AuthProvider's supabase client must target the `lucy` schema for `from('user_profiles')`. Confirm the client config in `auth.tsx`; if it targets `public`, build a lucy-scoped client (the project already configures `db: { schema: 'lucy' }` elsewhere — reuse that pattern). Only upsert non-null fields so it doesn't clobber an edited profile (use `upsert` with `onConflict: 'user_id'` and set company only when provided — or guard: skip the upsert if `meta.company` is falsy and a row already exists).
- [ ] **Step 2:** READ `app/auth/signup/page.tsx`. It already has a `company` state + input. Pass it through: `signUp(email, password, { company: company.trim() || undefined })`. Confirm the input is labeled "Company (optional)". No client/contractor toggle exists — nothing to remove.
- [ ] **Step 3:** `npx tsc --noEmit` + `npm run build` clean. Manual: sign up with a company, confirm a `lucy.user_profiles` row appears (`docker exec ... "select user_id, company from lucy.user_profiles order by created_at desc limit 3"`).
- [ ] **Step 4: Commit**
```bash
git add lib/supabase/auth.tsx app/auth/signup/page.tsx
git commit -m "fix(auth): persist optional company to lucy.user_profiles on signup"
```

---

# PHASE B — Two-Factor Authentication

### Task B1: `lib/auth/twofa-session.ts`

**Files:** Create `lib/auth/twofa-session.ts`

- [ ] **Step 1: Implement** (per-tab sessionStorage flag, ported from CTR)
```ts
const KEY = 'lucy-2fa-passed';
export function set2faPassed(userId: string): void { try { sessionStorage.setItem(KEY, userId); } catch {} }
export function is2faPassed(userId?: string | null): boolean {
  if (typeof window === 'undefined' || !userId) return false;
  try { return sessionStorage.getItem(KEY) === userId; } catch { return false; }
}
export function clear2faPassed(): void { try { sessionStorage.removeItem(KEY); } catch {} }
```
- [ ] **Step 2:** `npx tsc --noEmit` clean. Commit:
```bash
git add lib/auth/twofa-session.ts
git commit -m "feat(2fa): per-tab 2FA session flag"
```

### Task B2: email-OTP routes

**Files:** Create `app/api/auth/2fa/request/route.ts`, `app/api/auth/2fa/verify/route.ts`

These are authenticated (the code goes to the user's own email). Use `resolveMemoryAuth(req)` to get `{ userId, email }` (cookie session), and the service client to write the code row.

- [ ] **Step 1: request route**
```ts
import { NextRequest } from 'next/server';
import { resolveMemoryAuth, serviceClient } from '@/lib/memory/auth';
import { createCode, CODE_TTL_MINUTES } from '@/lib/email/codes';
import { sendTemplateEmail } from '@/lib/email/send';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { userId, email } = await resolveMemoryAuth(req);
  if (!userId || !email) return Response.json({ ok: false }, { status: 401 });
  const svc = serviceClient();
  if (!svc) return Response.json({ ok: false }, { status: 500 });
  const code = await createCode(svc, userId, email, '2fa');
  await sendTemplateEmail(email, 'twoFactorCode', { firstName: email.split('@')[0], code, expiresMinutes: CODE_TTL_MINUTES });
  return Response.json({ ok: true });
}
```
- [ ] **Step 2: verify route**
```ts
import { NextRequest } from 'next/server';
import { resolveMemoryAuth, serviceClient } from '@/lib/memory/auth';
import { confirmCode } from '@/lib/email/codes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { userId } = await resolveMemoryAuth(req);
  if (!userId) return Response.json({ ok: false }, { status: 401 });
  const { code } = await req.json().catch(() => ({}));
  if (typeof code !== 'string') return Response.json({ ok: false, reason: 'mismatch' });
  const svc = serviceClient();
  if (!svc) return Response.json({ ok: false, reason: 'no_code' });
  const verdict = await confirmCode(svc, userId, code, '2fa');
  return Response.json(verdict);
}
```
- [ ] **Step 3:** `npx tsc --noEmit` + `npm run build` clean. Commit:
```bash
git add app/api/auth/2fa/request/route.ts app/api/auth/2fa/verify/route.ts
git commit -m "feat(2fa): email-OTP request + verify routes"
```

### Task B3: `app/auth/2fa/page.tsx` (email-OTP challenge)

**Files:** Create `app/auth/2fa/page.tsx`

- [ ] **Step 1: Implement** (requests a code on mount, verifies, sets the session flag, then redirects)
```tsx
'use client';
import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSupabaseClient } from '@/lib/supabase/client';
import { set2faPassed } from '@/lib/auth/twofa-session';

function Challenge() {
  const router = useRouter();
  const redirect = useSearchParams().get('redirect') || '/chat';
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { fetch('/api/auth/2fa/request', { method: 'POST' }).catch(() => {}); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null); setLoading(true);
    const res = await fetch('/api/auth/2fa/verify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }),
    });
    const json = await res.json(); setLoading(false);
    if (json.ok) {
      const { data } = await getSupabaseClient()!.auth.getUser();
      if (data.user?.id) set2faPassed(data.user.id);
      router.push(redirect); return;
    }
    setError('Invalid or expired code.');
  };

  return (
    <form onSubmit={submit} className="space-y-3 w-full max-w-sm">
      <h1 className="text-lg font-semibold text-white">Verify it's you</h1>
      <p className="text-xs text-gray-400">We emailed you a 6-digit code.</p>
      <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6} placeholder="123456"
        className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-2 text-gray-200 tracking-widest" />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button disabled={loading} className="w-full bg-lucy-600 hover:bg-lucy-500 disabled:opacity-50 text-white rounded px-3 py-2 text-sm">
        {loading ? 'Verifying…' : 'Verify'}
      </button>
      <button type="button" onClick={() => fetch('/api/auth/2fa/request', { method: 'POST' })} className="text-xs text-gray-500 hover:text-gray-300">Resend code</button>
    </form>
  );
}
export default function Page() {
  return <div className="min-h-screen flex items-center justify-center bg-gray-950 p-4"><Suspense fallback={null}><Challenge /></Suspense></div>;
}
```
Confirm `getSupabaseClient` is the browser client export in `lib/supabase/client.ts` (adapt name if different).
- [ ] **Step 2:** `npx tsc --noEmit` + `npm run build` clean. Commit:
```bash
git add app/auth/2fa/page.tsx
git commit -m "feat(2fa): email-OTP challenge page"
```

### Task B4: `app/auth/two-factor-setup/page.tsx` (TOTP enroll)

**Files:** Create `app/auth/two-factor-setup/page.tsx`

- [ ] **Step 1: Implement** (Supabase MFA enroll → QR + secret → verify)
```tsx
'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseClient } from '@/lib/supabase/client';

export default function Page() {
  const router = useRouter();
  const sb = getSupabaseClient();
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState('');
  const [factorId, setFactorId] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!sb) return;
      const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Authenticator App' });
      if (error) { setError(error.message); return; }
      setQr(data.totp.qr_code); setSecret(data.totp.secret); setFactorId(data.id);
    })();
  }, [sb]);

  const verify = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null);
    if (!sb) return;
    const challenge = await sb.auth.mfa.challenge({ factorId });
    if (challenge.error) { setError(challenge.error.message); return; }
    const { error } = await sb.auth.mfa.verify({ factorId, challengeId: challenge.data.id, code });
    if (error) { setError(error.message); return; }
    router.push('/settings/security');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 p-4">
      <form onSubmit={verify} className="space-y-4 w-full max-w-sm">
        <h1 className="text-lg font-semibold text-white">Set up authenticator app</h1>
        <p className="text-xs text-gray-400">Scan this QR in your authenticator app, then enter the 6-digit code.</p>
        {qr && <img src={qr} alt="2FA QR code" className="w-44 h-44 bg-white rounded p-2 mx-auto" />}
        {secret && <p className="text-[11px] text-gray-500 break-all">Or enter manually: <span className="text-gray-300">{secret}</span></p>}
        <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6} placeholder="123456"
          className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-2 text-gray-200 tracking-widest" />
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button className="w-full bg-lucy-600 hover:bg-lucy-500 text-white rounded px-3 py-2 text-sm">Enable 2FA</button>
      </form>
    </div>
  );
}
```
- [ ] **Step 2:** `npx tsc --noEmit` + `npm run build` clean. Commit:
```bash
git add app/auth/two-factor-setup/page.tsx
git commit -m "feat(2fa): TOTP enrollment page (Supabase MFA + QR)"
```

### Task B5: TOTP challenge + account-locked pages

**Files:** Create `app/auth/two-factor-challenge/page.tsx`, `app/auth/account-locked/page.tsx`

- [ ] **Step 1: challenge page** (login-time TOTP, 5-attempt cap → lock + sign out)
```tsx
'use client';
import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSupabaseClient } from '@/lib/supabase/client';
import { set2faPassed } from '@/lib/auth/twofa-session';

function Challenge() {
  const router = useRouter();
  const redirect = useSearchParams().get('redirect') || '/chat';
  const sb = getSupabaseClient();
  const [code, setCode] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const verify = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null);
    if (!sb) return;
    const factors = await sb.auth.mfa.listFactors();
    const totp = factors.data?.totp?.[0];
    if (!totp) { router.push(redirect); return; }
    const challenge = await sb.auth.mfa.challenge({ factorId: totp.id });
    if (challenge.error) { setError(challenge.error.message); return; }
    const { error } = await sb.auth.mfa.verify({ factorId: totp.id, challengeId: challenge.data.id, code });
    if (error) {
      const n = attempts + 1; setAttempts(n);
      if (n >= 5) { await sb.auth.signOut(); router.push('/auth/account-locked'); return; }
      setError(`Invalid code. ${5 - n} attempts left.`); return;
    }
    const { data } = await sb.auth.getUser();
    if (data.user?.id) set2faPassed(data.user.id);
    router.push(redirect);
  };

  return (
    <form onSubmit={verify} className="space-y-3 w-full max-w-sm">
      <h1 className="text-lg font-semibold text-white">Two-factor authentication</h1>
      <p className="text-xs text-gray-400">Enter the 6-digit code from your authenticator app.</p>
      <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6} placeholder="123456"
        className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-2 text-gray-200 tracking-widest" />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button className="w-full bg-lucy-600 hover:bg-lucy-500 text-white rounded px-3 py-2 text-sm">Verify</button>
    </form>
  );
}
export default function Page() {
  return <div className="min-h-screen flex items-center justify-center bg-gray-950 p-4"><Suspense fallback={null}><Challenge /></Suspense></div>;
}
```
- [ ] **Step 2: account-locked page**
```tsx
import Link from 'next/link';
export default function Page() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 p-4 text-center">
      <div className="max-w-sm space-y-3">
        <h1 className="text-lg font-semibold text-white">Account temporarily locked</h1>
        <p className="text-sm text-gray-400">Too many failed verification attempts. Please sign in again.</p>
        <Link href="/auth/login" className="inline-block bg-lucy-600 hover:bg-lucy-500 text-white rounded px-4 py-2 text-sm">Back to sign in</Link>
      </div>
    </div>
  );
}
```
- [ ] **Step 3:** `npx tsc --noEmit` + `npm run build` clean. Commit:
```bash
git add app/auth/two-factor-challenge/page.tsx app/auth/account-locked/page.tsx
git commit -m "feat(2fa): TOTP challenge + account-locked pages"
```

### Task B6: Login gate

**Files:** Modify `app/auth/login/page.tsx`, `lib/supabase/auth.tsx`

- [ ] **Step 1:** In `lib/supabase/auth.tsx`, on `signOut` call `clear2faPassed()` (import from `@/lib/auth/twofa-session`).
- [ ] **Step 2:** READ `app/auth/login/page.tsx`. After a successful `signIn`, decide where to route:
```tsx
// after signIn success, before router.push('/chat'):
const sb = getSupabaseClient();
const { data: u } = await sb!.auth.getUser();
const factors = await sb!.auth.mfa.listFactors();
const hasTotp = (factors.data?.totp?.length ?? 0) > 0;
let emailTwofa = false;
if (u.user?.id) {
  const { data: prof } = await sb!.from('user_profiles').select('two_factor_email_enabled').eq('user_id', u.user.id).maybeSingle();
  emailTwofa = Boolean(prof?.two_factor_email_enabled);
}
if (hasTotp) { router.push('/auth/two-factor-challenge'); return; }
if (emailTwofa) { router.push('/auth/2fa'); return; }
router.push('/chat');
```
Confirm the login page's supabase client targets the `lucy` schema for the `user_profiles` read (reuse the project's lucy-scoped client pattern). Keep `router.refresh()` as before.
- [ ] **Step 3:** `npx tsc --noEmit` + `npm run build` clean.
- [ ] **Step 4: Commit**
```bash
git add app/auth/login/page.tsx lib/supabase/auth.tsx
git commit -m "feat(2fa): route to TOTP/email challenge at login; clear flag on signout"
```

### Task B7: Security page — change password + 2FA controls

**Files:** Modify `app/settings/security/page.tsx`

- [ ] **Step 1:** Replace the coming-soon stubs for "Change password" and "Two-factor authentication" with working controls (keep "Devices & sessions" as a stub until Phase C). Use `'use client'`, `getSupabaseClient`, the existing `Card`/`Button`/`Input` if present (else simple styled elements):
  - **Change password:** inline form (new password + confirm) → `sb.auth.updateUser({ password })`; success/error message.
  - **TOTP 2FA:** read `sb.auth.mfa.listFactors()`; if a verified TOTP factor exists show "Enabled" + a **Disable** button (`sb.auth.mfa.unenroll({ factorId })`); else a **Enable** button linking to `/auth/two-factor-setup`.
  - **Email 2FA:** a toggle bound to `user_profiles.two_factor_email_enabled` — read on mount, write via `sb.from('user_profiles').upsert({ user_id, two_factor_email_enabled })`.
Provide the full component. Match the dark `lucy-` styling of the existing scaffold (cards `bg-gray-900 border border-gray-800`).
- [ ] **Step 2:** `npx tsc --noEmit` + `npm run build` clean.
- [ ] **Step 3: Commit**
```bash
git add app/settings/security/page.tsx
git commit -m "feat(security): change password + TOTP + email-2FA controls"
```

---

# PHASE C — Device tracking + Profile

### Task C1: `lib/auth/device.ts`

**Files:** Create `lib/auth/device.ts`

- [ ] **Step 1: Implement**
```ts
function fingerprint(): string {
  const parts = [navigator.userAgent, navigator.language, `${screen.width}x${screen.height}`,
    Intl.DateTimeFormat().resolvedOptions().timeZone];
  let h = 0; const s = parts.join('|');
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
  return Math.abs(h).toString(36);
}
function parseUA(ua: string): { browser: string; os: string; deviceType: string } {
  const browser = /edg/i.test(ua) ? 'Edge' : /chrome/i.test(ua) ? 'Chrome' : /firefox/i.test(ua) ? 'Firefox' : /safari/i.test(ua) ? 'Safari' : 'Browser';
  const os = /windows/i.test(ua) ? 'Windows' : /mac/i.test(ua) ? 'macOS' : /android/i.test(ua) ? 'Android' : /linux/i.test(ua) ? 'Linux' : /iphone|ipad/i.test(ua) ? 'iOS' : 'Unknown';
  const deviceType = /mobile|android|iphone/i.test(ua) ? 'mobile' : 'desktop';
  return { browser, os, deviceType };
}
async function fetchIp(): Promise<string | null> {
  try { const r = await fetch('https://api.ipify.org?format=json'); if (!r.ok) return null; return (await r.json()).ip ?? null; } catch { return null; }
}

/** Fire-and-forget device registration after login. */
export async function trackDevice(): Promise<void> {
  if (typeof navigator === 'undefined') return;
  const ua = navigator.userAgent;
  const { browser, os, deviceType } = parseUA(ua);
  const ip = await fetchIp();
  await fetch('/api/auth/devices/track', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fingerprint: fingerprint(), browser, os, deviceType, ipAddress: ip,
      deviceName: `${browser} on ${os}` }),
  }).catch(() => {});
}
```
- [ ] **Step 2:** `npx tsc --noEmit` clean. Commit:
```bash
git add lib/auth/device.ts
git commit -m "feat(devices): client device fingerprint + trackDevice"
```

### Task C2: devices API routes

**Files:** Create `app/api/auth/devices/track/route.ts`, `app/api/auth/devices/route.ts`

- [ ] **Step 1: track route** (service-role upsert; mark current)
```ts
import { NextRequest } from 'next/server';
import { resolveMemoryAuth, serviceClient } from '@/lib/memory/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { userId } = await resolveMemoryAuth(req);
  if (!userId) return Response.json({ ok: false }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const svc = serviceClient();
  if (!svc) return Response.json({ ok: false }, { status: 500 });
  await svc.from('member_devices').update({ is_current: false }).eq('user_id', userId);
  await svc.from('member_devices').upsert({
    user_id: userId, fingerprint: String(b.fingerprint ?? ''), device_name: b.deviceName ?? null,
    device_type: b.deviceType ?? null, browser: b.browser ?? null, os: b.os ?? null,
    ip_address: b.ipAddress ?? null, is_current: true, last_active_at: new Date().toISOString(),
  }, { onConflict: 'user_id,fingerprint' });
  return Response.json({ ok: true });
}
```
- [ ] **Step 2: list/delete route** (RLS-scoped cookie client for read; service for delete by id+owner)
```ts
import { NextRequest } from 'next/server';
import { resolveMemoryAuth, serviceClient } from '@/lib/memory/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { userId, client } = await resolveMemoryAuth(req);
  if (!userId || !client) return Response.json({ devices: [] }, { status: 200 });
  const { data } = await client.from('member_devices').select('*').eq('user_id', userId).order('last_active_at', { ascending: false });
  return Response.json({ devices: data ?? [] });
}

export async function DELETE(req: NextRequest) {
  const { userId } = await resolveMemoryAuth(req);
  if (!userId) return Response.json({ ok: false }, { status: 401 });
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return Response.json({ ok: false }, { status: 400 });
  const svc = serviceClient();
  if (!svc) return Response.json({ ok: false }, { status: 500 });
  await svc.from('member_devices').delete().eq('id', id).eq('user_id', userId); // ownership-scoped
  return Response.json({ ok: true });
}
```
- [ ] **Step 3:** `npx tsc --noEmit` + `npm run build` clean. Commit:
```bash
git add app/api/auth/devices/track/route.ts app/api/auth/devices/route.ts
git commit -m "feat(devices): track + list/remove API routes"
```

### Task C3: Track device on login

**Files:** Modify `lib/supabase/auth.tsx`

- [ ] **Step 1:** Import `trackDevice` from `@/lib/auth/device`; call it (fire-and-forget) when a session becomes available after sign-in (in the `onAuthStateChange` `SIGNED_IN` branch). Guard so it runs once per session, not on every token refresh.
- [ ] **Step 2:** `npx tsc --noEmit` + `npm run build` clean. Commit:
```bash
git add lib/supabase/auth.tsx
git commit -m "feat(devices): register device on sign-in"
```

### Task C4: Security page device list

**Files:** Modify `app/settings/security/page.tsx`

- [ ] **Step 1:** Replace the "Devices & sessions" stub with a live list: `GET /api/auth/devices` on mount; render each device (`device_name`, `browser`/`os`, `ip_address`, `last_active_at`, a "This device" badge when `is_current`) with a **Remove** button → `DELETE /api/auth/devices?id=`. Re-fetch after removal. Match the existing card styling.
- [ ] **Step 2:** `npx tsc --noEmit` + `npm run build` clean. Commit:
```bash
git add app/settings/security/page.tsx
git commit -m "feat(security): device/session list with remove"
```

### Task C5: Profile page fields

**Files:** Modify `app/settings/profile/page.tsx`

- [ ] **Step 1:** Expand the scaffold to a profile form backed by `lucy.user_profiles`: `display_name`, `avatar_url`, `company` (optional), and `email` (read-only from `getSupabaseClient().auth.getUser()`). Load via `sb.from('user_profiles').select('*').eq('user_id', uid).maybeSingle()`; save via `upsert({ user_id, display_name, avatar_url, company, updated_at })` on blur or a Save button. Drop the old `user_preferences` companyName read (company now comes from `user_profiles`). Keep the dark `lucy-` styling.
- [ ] **Step 2:** `npx tsc --noEmit` + `npm run build` clean. Commit:
```bash
git add app/settings/profile/page.tsx
git commit -m "feat(profile): profile fields backed by lucy.user_profiles"
```

---

# Final

### Task D1: Full verification + docs

- [ ] **Step 1:** `npx jest` (all pass incl. codes), `npx tsc --noEmit`, `npm run lint` (no NEW errors), `npm run build` (Compiled successfully).
- [ ] **Step 2: Manual checklist** (dev on 3001):
  - Forgot password → receive code email → reset → log in with new password.
  - Security → enable TOTP (scan QR) → sign out → log in → TOTP challenge → in.
  - Security → toggle email-2FA on → sign out → log in → email code → in.
  - Sign up with a company → `lucy.user_profiles` row has the company.
  - Security → device appears, removable.
  - Profile → edit name/company → persists.
- [ ] **Step 3:** Update `CLAUDE.md` with an "Auth & Security" subsection (the lib/email/* + lib/auth/* modules, the lucy tables, the SMTP env vars, the 2FA flow + login gate, the devices API). Reference the spec + this plan. Commit:
```bash
git add CLAUDE.md
git commit -m "docs: document auth/security/profile (lib/email, 2FA, devices)"
```

---

## Self-Review (completed during planning)
- **Spec coverage:** tables (A1) · SMTP+email lib (A2–A7) · password recovery (A8–A10) · registration company-persist (A11) · TOTP (B4,B5) · email-OTP (B2,B3) · login gate + session flag (B1,B6) · Security 2FA controls (B7) · device tracking (C1–C4) · Profile (C5) · excluded items honored (no KYC, native email confirm untouched, server-side cookie gate deferred). Covered.
- **Type consistency:** `createCode(client,userId,email,purpose)`, `confirmCode(client,userId,code,purpose)`, `evaluateCode(row,code,nowMs)`, `Verdict`, `Purpose`, `set/is/clear2faPassed`, `trackDevice()`, `renderEmail(key,vars)`, `getTransport()` used consistently across tasks.
- **Verify-before-finish flags for the executor:** confirm `serviceClient`/`resolveMemoryAuth` exports + lucy-schema targeting in `lib/memory/auth.ts`; confirm `getSupabaseClient` name in `lib/supabase/client.ts`; confirm the `user_preferences` company column name before the A1 migration; ensure the AuthProvider/login clients target the `lucy` schema for `user_profiles` reads/writes.
