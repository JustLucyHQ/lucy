# Themes & account

## Five themes

**Settings → General → Appearance** has the theme picker — five swatch cards that
restyle the entire interface instantly:

| Theme | Character |
|---|---|
| **Luminous** (default) | Glassy surfaces, purple glow, soft depth |
| **Industrial** | Sharp corners, strong borders, precision-tool feel |
| **Editorial** | Bold typography, stark contrast, uppercase role labels in chat |
| **Minimal dark** | The classic quiet Lucy dark |
| **Light** | Plain, bright, corporate-friendly |

Your choice persists across reloads and (in connected mode) across devices. The
sun/moon button in the top bar is a quick toggle between **Light** and
**Luminous**.

## How switching works

Themes are pure CSS — no re-render, no reload. Picking a card just changes two
attributes on `<html>`, and a token-based stylesheet does the rest.

**CSS-variable tokens.** Every color in the UI reads from variables like `--bg`,
`--surface`, `--edge`, and `--accent` (defined in `app/globals.css`). The base
`:root` holds the light palette; `.dark` overrides them for dark mode; and each
brand theme adds a `[data-theme='…']` block that overrides them again. So
switching a theme is just swapping which set of variable values wins — nothing in
the components changes.

**Two attributes do the work** (`lib/theme.ts` → `applyThemeToDocument`):

| Theme | `<html>` class | `data-theme` |
|---|---|---|
| Light | `light` | — |
| Minimal dark | `dark` | — |
| Luminous / Industrial / Editorial | `dark` | the theme name |

The class toggles Tailwind's `dark:` utilities; `data-theme` selects the brand
token block (and a few brand-specific touches, like Editorial's uppercase role
labels). The three brand themes are dark-based, so they keep the `dark` class
*and* set `data-theme`.

**No-flash inline script.** A tiny script in `app/layout.tsx` runs **before React
hydrates**, reads your saved theme from `localStorage` (`lucy-settings`), and sets
the class + `data-theme` immediately — so you never see a flash of the default
theme on load. Because it runs before any module loads, it duplicates the
`lib/theme.ts` logic as a plain string; the two are kept in sync by hand.

**Where the value lives.** The active theme is held in the settings store and
written through to your storage adapter (local prefs standalone, Supabase in
connected mode), which is why it follows you across devices when signed in.
Switching is optimistic — it applies instantly and the persistence write happens
in the background. The store also mirrors the value into `localStorage` so the
no-flash script can read it on the next load.

## Your account

Click your avatar at the **bottom-left of the sidebar**. The menu has **Account**,
**Setup guide**, and **Sign out**. (The account area only exists in connected
mode; standalone Lucy has no login — see [Security & 2FA](/docs/security).)

**Account** opens three sections:

### Profile
Display name, avatar URL, and company — shown across Lucy and to apps sharing your
auth. Your **email is read-only**, managed by your login provider.

### Security
Change password, two-factor authentication (authenticator app and email code), and
your active devices & sessions live here. Full details — how 2FA is enforced,
device tracking, password reset — are on the [Security & 2FA](/docs/security) page.

### Billing
Current plan and usage. Self-hosted Lucy is **free** — all features included, you
bring your own provider keys.

### Sign out
**Sign out** is in the same avatar menu (not on the account page). It ends your
session and returns you to the login page.

## Admin

Users with the admin role see **Admin** in the sidebar: memory engine settings
(embedder, retention), the storage-mode indicator, and **Users & roles** — grant
or revoke admin with one click. The role is stored in Supabase auth metadata
(`app_metadata.lucy_role`), which only the service role can write, so users cannot
promote themselves. The first account on a fresh deployment is auto-promoted to
admin — see [Security & 2FA](/docs/security) for the details.
