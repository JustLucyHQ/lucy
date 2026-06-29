# Lucy — Design & IA Overhaul · Vision / Roadmap

**Status:** North-star vision (living) · **Date:** 2026-06-09 · **Owner:** Johnny

This is the umbrella document for Lucy's design/information-architecture overhaul. It
captures the design audit, the target IA, the sub-project decomposition, and the future
surfaces (connectors, voice). Each sub-project gets its own spec → plan → build cycle.

---

## 1. Why

`app/settings/page.tsx` has grown to ~796 lines holding 8 unrelated concerns in one
scroll. Navigation is a flat top-nav that mixes feature spaces, management, sub-pages,
and a one-time wizard. As connectors, admin tooling, voice, and per-user accounts arrive,
the current structure won't hold. We're restructuring the **frame** and the **settings IA**
first, then building the new surfaces into it.

## 2. Design audit — key findings

- **Settings is a config dump.** Changing a theme means scrolling past 8 provider key
  cards and a long embedder explanation.
- **Two different things both called "API Keys"** — provider credentials you *enter* vs.
  access tokens you *issue* — identical styling, opposite meaning.
- **MemoryPanel mixes user + admin** — the on/off toggle (user) shares a box with embedder
  model/dimensions/policy/deletion-window (admin/infra).
- **Nav doesn't scale** — `Chat · Personas · Workflows · Integrations · Settings · Onboarding`.
  "Onboarding" as permanent nav signals unresolved IA.
- **Keep as-is (well built):** `Card/Button/Badge/Input`, `ApiKeyCard`, `ChatWindow/ChatMessage`,
  `IntegrationCard`, the `lucy-` purple palette, the `pulse-dot` animation.
- **Polish targets:** `ModelSelector` native `<select>` → searchable combobox; duplicate
  theme toggle (Header + Settings) → one; add neutral design tokens (`surface/border/muted`)
  instead of hard-coded `gray-*`.

## 3. Target information architecture

**App shell:** a persistent **left sidebar** (240px, collapsible) + a **thin topbar**
(page title · search · avatar/user-menu). Decided over an icon-rail and a refined top-bar.

```
┌── Sidebar ──┬─────────── Topbar (title · search · avatar) ───────────┐
│ ⬣ Lucy      │                                                         │
│ 💬 Chat     │                                                         │
│ 🎭 Personas │   page content                                          │
│ 🔀 Workflows│   (Chat shows a second nested conversation-list panel)  │
│ 🔌 Connectors                                                          │
│ ─────────── │                                                         │
│ ⚙️ Settings │                                                         │
│ 🛡️ Admin🔒  │                                                         │
│ 👤 You      │                                                         │
└─────────────┴─────────────────────────────────────────────────────────┘
```

**Settings sub-nav:** `Profile · Security · Providers · Memory · Preferences · API Access`.

**Admin** is a **separate, gated top-level area** (not a Settings tab) — `LUCY_ADMIN_EMAIL`
gates it; non-admins see the nav item **greyed with a lock + tooltip** (visible, disabled).

**Onboarding** leaves the nav → "Setup guide" in the user menu.

## 4. Sub-project decomposition

| # | Sub-project | Status | Spec |
|---|---|---|---|
| **1** | **Settings + Admin + App-shell IA** | designed → spec written | `2026-06-09-settings-admin-appshell-design.md` |
| **2** | **Auth, Security & Profile** (port from CTR) | designed → spec written | `2026-06-09-auth-security-profile-design.md` |
| **3** | **Connectors / MCP marketplace** | designed → spec written | `2026-06-09-connectors-mcp-marketplace-design.md` |
| **4** | **Voice / TTS (+ STT)** | future surface | spec TBD |
| **5** | Polish (ModelSelector combobox, design tokens, theme-toggle dedupe) | backlog | — |

Build order: **1 → 2** (foundational frame + accounts), then **3 / 4** as the new surfaces,
with **5** woven in. Each future surface's *placement* is reserved now (see §6) so #1 doesn't
have to be reworked.

## 5. Sub-project 2 — Auth, Security & Profile (full CTR parity, minus KYC)

Port CTR's security implementation (`C:\RepositoryAI\contractors-room`). **CTR is Next.js 12
(Pages Router); Lucy is Next.js 14 (App Router)** — so this is a re-implementation of the
*logic*, not a file copy. Scope (the user chose **full parity** — "how it's built now in CTR"):

- **2FA — both mechanisms CTR has:**
  - **TOTP MFA** via Supabase (`auth.mfa.enroll` → QR + secret → `challenge` → `verify`);
    setup page + login challenge page; enable/disable from the Security page.
  - **Email-code 2FA** as a second factor (request → 6-digit code → verify; `email_verification_codes`
    with `purpose='2fa'`).
- **Password recovery — CTR's custom flow:** request → emailed 6-digit code (scrypt-hashed,
  15-min TTL, 5-attempt cap) → confirm + new password (`supabase.auth.admin.updateUserById`).
  Ported from `lib/email/verify.ts`. **Requires SMTP/nodemailer** config.
- **Device tracking:** `member_devices` — fingerprint (UA+locale+screen+tz), IP lookup,
  list/remove sessions on the Security page.
- **Profile + Security pages:** name, avatar, **company (optional)**, email; change-password
  modal; 2FA enable/disable; device list.
- **Registration:** remove the **Client/Contractor** toggle (Lucy is single-role; CTR's the
  one with it). Make **company optional and actually persisted** (today Lucy collects then
  drops it — known bug).
- **Middleware/route protection + session handling** parity (cookie gate + redirect; 2FA
  session flags `set2faPassed`/`is2faPassed`).
- **Exclude:** KYC / Didit (`/api/kyc/*`, `KycVerification`).
- **Data note:** Lucy shares CTR's Supabase. Spec 2 decides whether to reuse CTR's tables
  (`email_verification_codes`, `member_devices`) or create `lucy`-schema equivalents.
- **New deps:** `nodemailer` (+ SMTP env); Supabase MFA needs no extra package.

## 6. Future-surface placement (reserved in sub-project 1)

- **Connectors** → a **top-level** nav item. The current `/settings/integrations` content
  moves to `/connectors`. The marketplace/browse-and-install pattern is sub-project 3.
- **Voice** → a **disabled mic button** in `ChatInput` (left of Send) is added now as an
  affordance; a **Voice** subsection placeholder lands in Preferences. Real TTS output +
  STT input + voice overlay are sub-project 4.

## 7. Design system

- **Keep:** `Card/Button/Badge/Input`, `ApiKeyCard`, `ChatWindow/ChatMessage`,
  `IntegrationCard`, the `lucy-` palette (`lucy-500 #8b5cf6` primary, `lucy-700` accent),
  the `fade-in / slide-up / pulse-dot` animations.
- **Add (light touch):** neutral semantic tokens (`surface`, `border`, `muted`) so future
  surfaces stop hard-coding `gray-*`.

## 8. Open questions

- Spec 2: reuse CTR's shared Supabase tables vs. create `lucy`-schema equivalents?
- Admin "am I admin" signal — extend the settings/me response with an `is_admin` flag.
- Voice provider for TTS/STT (sub-project 4) — local (e.g. Piper/Whisper) vs. cloud.
