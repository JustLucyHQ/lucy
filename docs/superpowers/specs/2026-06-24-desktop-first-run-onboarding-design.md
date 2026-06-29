# Desktop Standalone First-Run / Onboarding — Design

**Date:** 2026-06-24
**Status:** Approved
**Scope:** The first-time experience when a user downloads the Windows `.exe`
(electron-builder NSIS), installs Lucy, and launches it for the first time.

## Problem

The desktop installer is built with `desktop:prepare` → a plain `next build`,
which bakes the developer's `.env.local` into the client bundle. Because
`isSupabaseEnabled()` is:

```ts
Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
```

the shipped app boots in **connected mode** pointing at `http://localhost:8000`
(the dev Supabase). On a fresh user's machine that host is unreachable: the auth
middleware redirects to `/auth/login`, the login form POSTs to localhost:8000,
and the user sees **"failed to fetch."** A fresh user can never get in.

## Goals

1. The desktop build is **local-first**: no Supabase baked in → standalone mode
   → no login wall, all routes public, data in localStorage/IndexedDB.
2. A fresh user lands in a **first-run wizard**, not a broken login.
3. The wizard lets a user power Lucy with **either** a cloud API key **or** a
   **local model (Ollama / LM Studio)** — so a user with no API key can still
   finish.
4. An optional **Connect to Cloud** path (justlucy.ai) for users who want an
   account / cross-device sync. Cloud is opt-in, not forced.

Non-goal (YAGNI for go-live): full local↔cloud data migration. "Connect to
Cloud" just opens the hosted app.

## Design

### 1. Local-first desktop build

Add a dedicated build script that clears the two public Supabase vars before
`next build`. Next's env loader does not override an already-set `process.env`
key, so an explicitly-empty value wins over `.env.local`:

```json
"desktop:build": "cross-env NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_ANON_KEY= next build",
"desktop:prepare": "npm run desktop:build && node electron/copy-standalone.js",
```

`dist` and `electron:dev` already chain through `desktop:prepare`, so they pick
this up. Add `cross-env` as a devDependency.

`isSupabaseEnabled()` then returns `false` in the packaged app → the
`StorageProvider` selects `LocalStorageAdapter`, `proxy.ts` does not gate routes,
and `/chat` is reachable without auth.

### 2. First-run gate

In `app/chat/page.tsx`, a client-side effect runs once on mount:

- Only in **standalone** mode (`!isSupabaseEnabled()`).
- If `localStorage['lucy.onboarded']` is **not** set **and** no provider key is
  configured (settings store `apiKeys` all empty) → `router.replace('/onboarding')`.

This keeps Electron's `main.js` dumb (it still loads `/chat`). Returning users —
or anyone who already has a key — go straight to chat. The flag makes the bounce
one-time even if the user finishes onboarding without adding a cloud key (e.g.
they chose a local model).

### 3. Wizard: personal + local-LLM option

`components/onboarding/OnboardingWizard.tsx` is currently B2B (requires a company
name, only cloud keys, an "invite team" step). Changes, branched on
`useStorageMode()` so the connected/web onboarding is untouched:

- **Welcome step:** company name is **optional** in standalone (the `canProceed`
  gate drops); personal copy ("your private AI, on your machine").
- **Power Lucy step:** a tabbed choice —
  - **Cloud provider** — the existing Anthropic/OpenAI/Google key fields.
  - **Local model** — a "Detect Ollama / LM Studio" button that probes
    `GET /api/models?includeLocal=true` and lists any local models found; if none,
    shows an install hint linking to https://ollama.com. No key required.
- **Final step:** replace "Invite team" with **"You're all set"** plus an
  optional **Connect to Cloud** card (button opens https://justlucy.ai), shown
  only in standalone mode (in connected mode the user is already signed in).
- **On finish:** `localStorage.setItem('lucy.onboarded', '1')`, then
  `router.push('/chat')`.

### 4. Connect to Cloud

No new backend. The onboarding card and the existing Electron "Connect to Cloud
(justlucy.ai)" menu item both just navigate to the hosted app. The local install
stays local.

## Files

- `package.json` — add `desktop:build` script, route `desktop:prepare` through
  it, add `cross-env` devDep.
- `components/onboarding/OnboardingWizard.tsx` — mode-aware copy, optional
  company name, Local-model tab, Connect-to-Cloud final step, onboarded flag.
- `app/chat/page.tsx` — first-run gate effect.

## Verification

- `tsc` + `lint` clean.
- `npm run build` (connected/web) still compiles.
- `npm run desktop:build` produces a bundle where `isSupabaseEnabled()` is false
  (spot-check: standalone storage, no `/auth/login` redirect).
- Rebuild the installer (`npm run dist`) and confirm a clean first run lands in
  `/onboarding`, a local-model or cloud-key path both reach a working `/chat`,
  and a second launch goes straight to chat.
