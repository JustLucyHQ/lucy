# Settings + Admin + App-Shell IA — Design Spec

**Status:** Approved (design) · **Date:** 2026-06-09 · **Owner:** Johnny
**Umbrella:** `2026-06-09-lucy-design-overhaul-vision.md` (sub-project #1)

## Goal

Replace the flat top-nav and the 796-line monolithic settings page with a **left-sidebar
app shell** and a **divided Settings area**, and pull **admin/deployment** config into its
own gated area. Reserve placement for the coming **Connectors** and **Voice** surfaces.
This sub-project is mostly **relocation of existing, well-built components** into a new
shell + routes — not component rewrites.

## In scope
App shell (sidebar + thin topbar) · Settings split into sub-routes · Admin area + gating ·
MemoryPanel split (user vs admin) · Profile + Security section **scaffolding** (placement;
functionality is sub-project #2) · Connectors moved to top-level · a disabled voice mic
affordance + Voice placeholder in Preferences.

## Out of scope (deferred)
Auth/security functionality — 2FA, password-reset, device tracking, profile fields (sub-project
#2) · Connectors marketplace/browse (#3) · real voice/TTS/STT (#4) · ModelSelector combobox
rewrite + new design tokens (#5, polish).

---

## 1. App shell

**New components (`components/layout/`):**
- `AppShell.tsx` — wraps page content; renders `Sidebar` + `Topbar` + `{children}`. Used by
  the root `app/layout.tsx` for authenticated app routes (not `/auth/*`, not `/embed`).
- `Sidebar.tsx` — 240px, collapsible (reuse the existing `PanelLeftClose/PanelLeftOpen`
  toggle + `sidebarOpen` state pattern already in `chat/page.tsx`). Items, in order:
  `Chat · Personas · Workflows · Connectors · —divider— · Settings · Admin` and a bottom
  **user menu** (avatar → Profile, Security, Setup guide [onboarding], Sign out). Active route
  highlighted (port the `aria-current` logic from `Header.tsx`).
  - **Admin** item: shown to everyone; **disabled + lock icon + tooltip "Admin access required"**
    for non-admins (see §4 gating).
- `Topbar.tsx` — thin: collapse toggle · page title/breadcrumb · search · theme quick-toggle ·
  avatar. Replaces the nav-link portion of the current `Header.tsx`.

**`Header.tsx`** is reduced to (or replaced by) `Topbar`; its `navItems` array is removed.
**Onboarding** leaves the nav. **Chat** keeps its existing `ChatSidebar` as a second nested
panel (sidebar → app nav; ChatSidebar → conversations).

## 2. Settings area

**`app/settings/layout.tsx`** (new) renders a settings **sub-nav** (left, inside the content
area) + `{children}`. Sub-routes (each a small `page.tsx` that renders existing components):

| Route | Renders |
|---|---|
| `app/settings/profile/page.tsx` | Profile fields (scaffold — see §5) |
| `app/settings/security/page.tsx` | Security (scaffold — see §5) |
| `app/settings/providers/page.tsx` | The 8 `ApiKeyCard`s + the Local Models block (Ollama/LM Studio) |
| `app/settings/memory/page.tsx` | User memory controls only (toggle, incognito, usage) |
| `app/settings/preferences/page.tsx` | Theme (single toggle) · default model · default persona · **Voice** placeholder |
| `app/settings/api-access/page.tsx` | The outbound-token `ApiKeysSection`, heading renamed "API Access" |

`app/settings/page.tsx` becomes a redirect to `app/settings/providers` (or `profile`).
The current monolithic page's sections are **moved**, not rewritten.

## 3. MemoryPanel split

`components/settings/MemoryPanel.tsx` currently mixes user + admin. Split into:
- `MemoryPanel.tsx` (user) — enabled toggle, incognito, storage usage. Stays in
  `settings/memory`. Local-mode (`LocalMemoryPanel`) unchanged.
- `AdminMemoryPanel.tsx` (new) — embedder config (presets, model, base URL, dimensions,
  write-only key), contradiction policy, deletion grace window, storage metrics. Rendered in
  the **Admin** area (§4). All existing logic moves over verbatim; only its home changes.

## 4. Admin area

**`app/admin/page.tsx`** (new, gated). Sections: **Memory** (`AdminMemoryPanel`),
**Deployment** (storage-mode indicator; room for future deployment config).

**Gating:**
- Server already enforces `LUCY_ADMIN_EMAIL` on `POST /api/memory/settings`. Add a new
  `GET /api/admin/me` that returns `{ isAdmin: boolean }` (derived from `resolveMemoryAuth`
  email vs. the `LUCY_ADMIN_EMAIL` list; returns `isAdmin: true` when `LUCY_ADMIN_EMAIL` is
  unset, matching the current "any authed user" default). The client uses this to (a) render
  the Admin nav item enabled vs. greyed, and (b) guard the `/admin` route (redirect non-admins
  to `/chat` with a toast).
- The route is **defense-in-depth only** on the client; the real protection stays server-side
  on the admin endpoints. (Full RBAC is Phase C, out of scope.)

## 5. Profile + Security scaffolding

Created as routes now; **fields/flows are stubs** filled by sub-project #2:
- `settings/profile` — form shell for name, avatar, **company (optional)**, email (read-only).
  Wire name/company to `updatePreferences` (this also fixes the dropped-company bug minimally).
- `settings/security` — placeholders for "Change password", "Two-factor authentication",
  "Devices", each a disabled card with a "Coming soon" note until #2 lands.

## 6. Connectors (relocation only)

- New top-level route `app/connectors/page.tsx` rendering the **existing**
  `app/settings/integrations/page.tsx` content (`IntegrationCard`s, embed snippet). Move the
  file; update the nav target. `/settings/integrations` redirects to `/connectors`.
- Marketplace/browse/install = sub-project #3 (not now).

## 7. Voice affordance (placement only)

- Add a **disabled microphone `<button>`** to `components/chat/ChatInput.tsx`, left of Send,
  with a tooltip "Voice coming soon". No backend.
- Add a **Voice** subsection to `settings/preferences` — a disabled card ("Voice output &
  input — coming soon"). Real TTS/STT = sub-project #4.

## 8. Keep unchanged
`Card/Button/Badge/Input`, `ApiKeyCard`, `ChatWindow/ChatMessage`, `IntegrationCard`,
`ModelSelector` (combobox rewrite is #5), `lucy-` palette, animations.

## 9. Components — create / modify / move

- **Create:** `AppShell`, `Sidebar`, `Topbar`, `SettingsNav` (sub-nav), `AdminMemoryPanel`,
  the 6 settings sub-route pages, `app/admin/page.tsx`, `app/connectors/page.tsx`,
  `app/api/admin/me/route.ts`.
- **Modify:** `app/layout.tsx` (wrap in `AppShell`), `Header.tsx` → `Topbar` (drop navItems),
  `MemoryPanel.tsx` (extract admin into `AdminMemoryPanel`), `ChatInput.tsx` (mic affordance),
  `app/settings/page.tsx` (→ redirect).
- **Move:** `app/settings/integrations/page.tsx` → `app/connectors/page.tsx`.

## 10. Testing
- `npx tsc --noEmit`, `npm run lint`, `npm run build` green.
- Manual: every nav item routes correctly; Settings sub-nav switches sections; Admin item is
  greyed for a non-admin email and active for an admin; collapse toggle works; Chat's nested
  conversation panel still works; `/settings/integrations` redirects to `/connectors`.
- No new unit tests required (structural/IA); add one test for `GET /api/admin/me` gating logic.

## 11. Risks
- The root `app/layout.tsx` wrap must exclude `/auth/*` and `/embed` (no shell there) — use a
  route-group or a conditional in the layout.
- Moving the integrations page must preserve the registration side-effects
  (`registerContractorsRoom()`); keep that import path intact.
