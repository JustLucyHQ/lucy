# Lucy Branding: Three Themes, Manrope, and the Account Section

**Date:** 2026-06-10
**Status:** Approved (brainstormed with visual companion; user selected Luminous Depth as default and the avatar-menu Account pattern)

## Goal

Make Lucy visually distinctive ("crisp", not generic-minimal) with three selectable brand themes set in Manrope, and restructure navigation so personal account concerns (profile, security, billing) live in their own `/account` section instead of Settings.

## 1. Theme System

### Theme set

| Theme id | Picker label | Base | Character |
|---|---|---|---|
| `luminous` | Luminous (default) | dark | Glassy surfaces, purple glow, gradients, pill/14px radii — premium AI-product look |
| `industrial` | Industrial | dark | Sharp 6px radii, visible hairline borders, strong panel separation, tight headings |
| `editorial` | Editorial | dark | Bold type hierarchy, uppercase micro-labels, stark contrast, purple accent lines, 4px radii |
| `dark` | Minimal dark | dark | The current look, unchanged — legacy option |
| `light` | Light | light | Existing light mode, unchanged |

### Mechanics

- `Theme` union in `lib/store/settings.ts` becomes `'light' | 'dark' | 'luminous' | 'industrial' | 'editorial'`.
- **Default for new users: `luminous`.** Existing users keep their persisted choice (no migration).
- `<html>` element: all dark-based themes keep `class="dark"` (existing `dark:` utilities keep working). Brand themes additionally set `data-theme="luminous|industrial|editorial"`. `light` and `dark` set no `data-theme`.
- The **no-flash inline script** in `app/layout.tsx` reads `lucy-settings` and applies both class and `data-theme` before hydration. `components/ThemeProvider.tsx` keeps them in sync at runtime.

### Design tokens (CSS variables in `app/globals.css`)

Defined per theme under `:root`, `[data-theme='luminous']`, `[data-theme='industrial']`, `[data-theme='editorial']`. RGB-triplet form so Tailwind alpha works.

| Token | Purpose |
|---|---|
| `--bg` | Page background |
| `--surface` | Panel background (sidebar, cards, assistant bubbles) |
| `--raised` | Elevated surface (headers, inputs, hover) |
| `--edge` | Default border |
| `--edge-strong` | Emphasized border (industrial uses high contrast here) |
| `--accent` / `--accent-soft` | Purple accent + translucent variant |
| `--text-1` / `--text-2` / `--text-3` | Primary / secondary / muted text |
| `--radius` | Theme corner radius (luminous 14px, industrial 6px, editorial 4px, minimal 12px) |
| `--glow` | Box-shadow color for glow effects (transparent in industrial/editorial/minimal) |

`tailwind.config.ts` maps them to semantic utilities: `bg-bg`, `bg-surface`, `bg-raised`, `border-edge`, `border-edge-strong`, `text-t1/t2/t3`, `bg-accent`, `rounded-theme`, `shadow-glow`. The `lucy` purple scale stays for places that want explicit purple.

### Component migration (shell-first)

Migrate to semantic tokens now:
- `components/layout/` — AppShell, Sidebar, Topbar
- `components/chat/` — ChatWindow, ChatMessage, ChatInput, ChatSidebar, ModelSelector, PersonaSelector
- `app/settings/layout.tsx` + `components/settings/SettingsNav.tsx`
- `components/ui/` — Card, Button, Input, Badge, Avatar

Theme-specific flourishes beyond tokens (kept minimal, via `[data-theme='…']` CSS in globals.css):
- Luminous: gradient user bubbles, glow on primary buttons/avatar, pill input.
- Editorial: uppercase `.theme-label` micro-labels on message roles, accent left-border on assistant messages, heavier heading weights.
- Industrial: nothing special — tokens (sharp radius, strong edges) carry it.

**Out of scope for this pass:** workflow canvas internals, connectors marketplace grid, onboarding, embed widget — they keep current gray utilities (legible under all dark themes) and converge later.

### Theme picker

Settings → General: five swatch cards (mini preview rectangles showing bg/surface/accent), replacing the current light/dark control. Persisted exactly as today (settings store → storage adapter).

## 2. Typography: Manrope

- `next/font/google` Manrope, variable axis (weights 400–800), `display: swap`, exposed as `--font-manrope` on `<html>`.
- `tailwind.config.ts`: `fontFamily.sans = ['var(--font-manrope)', ...system fallbacks]`.
- Applies app-wide in every theme, including auth pages and the embed widget page.

## 3. Account Section (`/account`)

### Navigation pattern (user-selected: option A)

- Topbar avatar becomes a small dropdown menu: **Account** → `/account/profile`, divider, **Sign out**.
- The product sidebar (Chat, Personas, Workflows, Connectors, Settings, Admin) does NOT get an Account item.

### Structure

```
app/account/
├── layout.tsx        # AppShell + AccountNav sub-sidebar (mirrors settings/layout.tsx pattern)
├── page.tsx          # redirect → /account/profile
├── profile/page.tsx  # moved content from app/settings/profile (display name, avatar, company)
├── security/page.tsx # moved content from app/settings/account (password, TOTP, email 2FA, devices)
└── billing/page.tsx  # new scaffold (see §5)
```

`components/account/AccountNav.tsx` — sub-nav like SettingsNav: Profile, Security, Billing.

### Redirects & protection

- `/settings/profile` → `/account/profile`; `/settings/account` → `/account/security`; `/settings/security` → `/account/security` (page-level `redirect()` like the existing `/settings/integrations` pattern).
- `proxy.ts`: add `/account` to `protectedPrefixes`.

## 4. Settings Cleanup

`SettingsNav` sections become exactly: **General, Providers, Memory, Voice, API Access**. No personal items. Theme picker lives in General. `/settings` continues to redirect to its first section.

## 5. Billing Scaffold

`/account/billing` placeholder, no payment integration:
- Plan card: "Free — all features included while Lucy is self-hosted", styled with theme tokens.
- Usage card: conversation count + estimated total tokens (from the conversations store).
- Disabled "Manage subscription" button with note that payment integration arrives later.

When real billing lands it will follow the Stripe best-practices skill; nothing in this scaffold should presuppose a provider.

## 6. Error Handling & Edge Cases

- Unknown/legacy stored theme value → treated as `dark` (minimal) by the inline script and ThemeProvider; never crashes.
- `data-theme` and class are both cleared/reset on every theme change (no stale attribute).
- Manrope load failure → system font fallback via the font stack; no layout dependency on exact metrics.
- Standalone mode: `/account/security` already degrades (auth-only features show their existing "requires Supabase" states); billing scaffold is mode-agnostic.

## 7. Testing & Verification

- Unit: theme-application helper (given stored settings → expected class + data-theme), AccountNav render, redirect pages.
- Existing 209-test suite stays green; ThemeProvider/ModelSelector tests updated if selectors change.
- `tsc`, ESLint (React Compiler rules at error level), production build.
- Live smoke test: boot, switch all five themes via the picker, verify chat/settings/account render in each, verify old settings URLs redirect, verify avatar menu.
