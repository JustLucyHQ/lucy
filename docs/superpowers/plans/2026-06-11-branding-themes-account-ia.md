# Branding Themes + Manrope + Account Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three selectable brand themes (Luminous default, Industrial, Editorial) on a CSS-variable token system, Manrope app-wide, and a new `/account` section (Profile · Security · Billing) replacing the personal items in Settings.

**Architecture:** Themes = `class="dark|light"` (kept for existing `dark:` utilities) + `data-theme` attribute on `<html>`, driving CSS custom properties consumed through semantic Tailwind utilities (`bg-surface`, `border-edge`, `rounded-theme`…). Shell-first migration: layout chrome, chat surface, settings shell, UI primitives. `/account` mirrors the existing `settings/layout.tsx` sub-nav pattern; old URLs redirect.

**Tech Stack:** Next.js 16 (App Router, Turbopack), Tailwind 3 (CSS vars), next/font (Manrope), Zustand settings store, Jest 30 + RTL.

**Spec:** `docs/superpowers/specs/2026-06-10-branding-themes-account-ia-design.md`

**Branch:** create `feat/branding-themes` from `master` before Task 1.

---

### Task 1: Theme resolution helper (TDD)

**Files:**
- Create: `lib/theme.ts`
- Test: `__tests__/lib/theme.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/lib/theme.test.ts
import { resolveThemeAttrs, BRAND_THEMES, THEME_OPTIONS } from '@/lib/theme';

describe('resolveThemeAttrs', () => {
  it('maps light to light class and no data-theme', () => {
    expect(resolveThemeAttrs('light')).toEqual({ isDark: false, dataTheme: null });
  });

  it('maps minimal dark to dark class and no data-theme', () => {
    expect(resolveThemeAttrs('dark')).toEqual({ isDark: true, dataTheme: null });
  });

  it('maps each brand theme to dark class + its data-theme', () => {
    for (const t of BRAND_THEMES) {
      expect(resolveThemeAttrs(t)).toEqual({ isDark: true, dataTheme: t });
    }
  });

  it('falls back to minimal dark for unknown or missing values', () => {
    expect(resolveThemeAttrs(undefined)).toEqual({ isDark: true, dataTheme: null });
    expect(resolveThemeAttrs('neon-zebra')).toEqual({ isDark: true, dataTheme: null });
  });

  it('exposes picker options for all five themes', () => {
    expect(THEME_OPTIONS.map((o) => o.id)).toEqual([
      'luminous', 'industrial', 'editorial', 'dark', 'light',
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/lib/theme.test.ts`
Expected: FAIL — `Cannot find module '@/lib/theme'`

- [ ] **Step 3: Write the implementation**

```typescript
// lib/theme.ts
/**
 * Theme model. Five themes: three brand themes (dark-based, set data-theme),
 * plus the legacy minimal dark and light.
 *
 * NOTE: the no-flash inline script in app/layout.tsx duplicates this logic
 * as a plain string (it runs before any module loads). Keep them in sync.
 */

export const BRAND_THEMES = ['luminous', 'industrial', 'editorial'] as const;
export type BrandTheme = (typeof BRAND_THEMES)[number];
export type Theme = 'light' | 'dark' | BrandTheme;

export const DEFAULT_THEME: Theme = 'luminous';

export interface ThemeAttrs {
  isDark: boolean;
  dataTheme: BrandTheme | null;
}

export function resolveThemeAttrs(theme: string | undefined | null): ThemeAttrs {
  if (theme === 'light') return { isDark: false, dataTheme: null };
  if ((BRAND_THEMES as readonly string[]).includes(theme ?? '')) {
    return { isDark: true, dataTheme: theme as BrandTheme };
  }
  return { isDark: true, dataTheme: null };
}

/** Apply class + data-theme to <html>. Used by ThemeProvider. */
export function applyThemeToDocument(theme: string | undefined | null): void {
  const root = document.documentElement;
  const { isDark, dataTheme } = resolveThemeAttrs(theme);
  root.classList.toggle('dark', isDark);
  root.classList.toggle('light', !isDark);
  if (dataTheme) root.setAttribute('data-theme', dataTheme);
  else root.removeAttribute('data-theme');
}

/** Picker metadata for Settings → General. */
export const THEME_OPTIONS: { id: Theme; label: string; blurb: string }[] = [
  { id: 'luminous', label: 'Luminous', blurb: 'Glassy purple glow — the default' },
  { id: 'industrial', label: 'Industrial', blurb: 'Sharp edges, strong borders' },
  { id: 'editorial', label: 'Editorial', blurb: 'Bold type, stark contrast' },
  { id: 'dark', label: 'Minimal dark', blurb: 'The classic Lucy dark' },
  { id: 'light', label: 'Light', blurb: 'Plain light mode' },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/lib/theme.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/theme.ts __tests__/lib/theme.test.ts
git commit -m "feat(theme): theme resolution helper with brand themes"
```

---

### Task 2: Widen the Theme type in the settings store

**Files:**
- Modify: `lib/store/settings.ts`

- [ ] **Step 1: Update the type and default**

In `lib/store/settings.ts`, find the `Theme` type (currently `'dark' | 'light'` or similar) and the store default `theme: 'dark'`. Replace with:

```typescript
import type { Theme } from '@/lib/theme';
export type { Theme };
```

(remove the local `Theme` definition; re-export so existing `import type { Theme } from '@/lib/store/settings'` consumers keep compiling)

and change the initial state:

```typescript
theme: 'luminous' as Theme,
```

Existing users keep their persisted `'dark'`/`'light'` value — only fresh installs get `luminous`.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean (if `UserPreferences` in `lib/storage/index.ts` declares `theme: 'dark' | 'light'`, widen it to `Theme` by importing from `@/lib/theme`)

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: all suites pass (ThemeProvider isn't directly tested today)

- [ ] **Step 4: Commit**

```bash
git add lib/store/settings.ts lib/storage/index.ts
git commit -m "feat(theme): widen Theme type, default new users to luminous"
```

---

### Task 3: ThemeProvider + no-flash script set data-theme

**Files:**
- Modify: `components/ThemeProvider.tsx`
- Modify: `app/layout.tsx:40-60` (inline script)

- [ ] **Step 1: Rewrite ThemeProvider to use the helper**

```tsx
// components/ThemeProvider.tsx
'use client';

import { useEffect } from 'react';
import { useSettingsStore } from '@/lib/store/settings';
import { applyThemeToDocument } from '@/lib/theme';

/**
 * Applies the current theme (class + data-theme attribute) to <html>
 * whenever the zustand settings store's theme value changes.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSettingsStore((s) => s.theme);

  useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  return <>{children}</>;
}
```

- [ ] **Step 2: Update the inline script in app/layout.tsx**

Replace the script body (keep the surrounding `<script dangerouslySetInnerHTML…>`):

```javascript
(function() {
  // KEEP IN SYNC with lib/theme.ts (this runs before modules load)
  var BRAND = ['luminous', 'industrial', 'editorial'];
  var theme = 'luminous';
  try {
    var stored = localStorage.getItem('lucy-settings');
    if (stored) {
      var parsed = JSON.parse(stored);
      if (parsed && parsed.state && parsed.state.theme) theme = parsed.state.theme;
    }
  } catch (e) {}
  var isLight = theme === 'light';
  document.documentElement.classList.add(isLight ? 'light' : 'dark');
  if (BRAND.indexOf(theme) !== -1) document.documentElement.setAttribute('data-theme', theme);
})();
```

- [ ] **Step 3: Verify build + tests**

Run: `npx tsc --noEmit && npm test`
Expected: clean / all pass

- [ ] **Step 4: Commit**

```bash
git add components/ThemeProvider.tsx app/layout.tsx
git commit -m "feat(theme): apply data-theme attribute pre-hydration and at runtime"
```

---

### Task 4: Manrope + design tokens + Tailwind semantic utilities

**Files:**
- Modify: `app/layout.tsx` (font)
- Modify: `app/globals.css` (tokens)
- Modify: `tailwind.config.ts` (mappings)

- [ ] **Step 1: Add Manrope via next/font in app/layout.tsx**

At the top of `app/layout.tsx`:

```tsx
import { Manrope } from 'next/font/google';

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
  display: 'swap',
});
```

Change the `<html>` tag to include the font variable, and switch body to token utilities:

```tsx
<html lang="en" className={`h-full ${manrope.variable}`} suppressHydrationWarning>
...
<body className="h-full bg-bg text-t1 antialiased font-sans" suppressHydrationWarning>
```

- [ ] **Step 2: Define tokens in app/globals.css**

Insert directly after the `@tailwind` directives (after the existing highlight.js `@import` + tailwind block):

```css
/* ── Design tokens ──────────────────────────────────────────────────────────
   Five themes. class dark/light controls dark: utilities; data-theme selects
   a brand skin. Triplets (R G B) so Tailwind alpha modifiers work; --glow is
   a full color value. */

:root {
  /* light */
  --bg: 250 250 252;
  --surface: 255 255 255;
  --raised: 244 244 246;
  --edge: 228 228 235;
  --edge-strong: 209 209 219;
  --accent: 124 58 237;
  --accent-soft: 139 92 246;
  --t1: 17 17 27;
  --t2: 82 82 102;
  --t3: 140 140 160;
  --radius: 12px;
  --glow: rgba(139, 92, 246, 0);
}

.dark {
  /* minimal dark — matches the current gray-950/900/800 look exactly */
  --bg: 3 7 18;
  --surface: 17 24 39;
  --raised: 31 41 55;
  --edge: 31 41 55;
  --edge-strong: 55 65 81;
  --accent: 124 58 237;
  --accent-soft: 139 92 246;
  --t1: 243 244 246;
  --t2: 156 163 175;
  --t3: 107 114 128;
  --radius: 12px;
  --glow: rgba(139, 92, 246, 0);
}

[data-theme='luminous'] {
  --bg: 12 10 22;
  --surface: 18 16 31;
  --raised: 27 24 45;
  --edge: 49 46 78;
  --edge-strong: 91 78 150;
  --t1: 245 245 250;
  --t2: 167 167 188;
  --t3: 113 113 135;
  --radius: 14px;
  --glow: rgba(139, 92, 246, 0.35);
}

[data-theme='industrial'] {
  --bg: 10 10 15;
  --surface: 13 13 20;
  --raised: 18 18 28;
  --edge: 50 50 74;
  --edge-strong: 63 63 90;
  --t1: 255 255 255;
  --t2: 209 213 219;
  --t3: 107 114 128;
  --radius: 6px;
  --glow: rgba(139, 92, 246, 0);
}

[data-theme='editorial'] {
  --bg: 5 5 7;
  --surface: 10 10 13;
  --raised: 16 16 20;
  --edge: 31 31 40;
  --edge-strong: 139 92 246;
  --t1: 250 250 250;
  --t2: 228 228 231;
  --t3: 113 113 122;
  --radius: 4px;
  --glow: rgba(139, 92, 246, 0);
}

/* ── Theme flourishes (component hooks) ──────────────────────────────────── */

/* Luminous: gradient user bubbles + glow */
[data-theme='luminous'] .msg-user {
  background-image: linear-gradient(135deg, #8b5cf6, #7c3aed);
  box-shadow: 0 4px 16px var(--glow);
}
[data-theme='luminous'] .btn-primary {
  box-shadow: 0 0 14px var(--glow);
}

/* Editorial: role labels + accent bar on assistant messages */
.role-label {
  display: none;
}
[data-theme='editorial'] .role-label {
  display: block;
  font-size: 9px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: rgb(var(--accent-soft));
  margin-bottom: 4px;
}
[data-theme='editorial'] .msg-assistant {
  border-left: 2px solid rgb(var(--accent-soft));
  padding-left: 12px;
}
[data-theme='editorial'] h1,
[data-theme='editorial'] h2 {
  letter-spacing: -0.03em;
}
```

- [ ] **Step 3: Map tokens in tailwind.config.ts**

Inside `theme.extend`:

```typescript
fontFamily: {
  sans: ['var(--font-manrope)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
},
colors: {
  lucy: { /* …existing scale stays… */ },
  bg: 'rgb(var(--bg) / <alpha-value>)',
  surface: 'rgb(var(--surface) / <alpha-value>)',
  raised: 'rgb(var(--raised) / <alpha-value>)',
  edge: 'rgb(var(--edge) / <alpha-value>)',
  'edge-strong': 'rgb(var(--edge-strong) / <alpha-value>)',
  accent: 'rgb(var(--accent) / <alpha-value>)',
  'accent-soft': 'rgb(var(--accent-soft) / <alpha-value>)',
  t1: 'rgb(var(--t1) / <alpha-value>)',
  t2: 'rgb(var(--t2) / <alpha-value>)',
  t3: 'rgb(var(--t3) / <alpha-value>)',
},
borderRadius: {
  theme: 'var(--radius)',
},
boxShadow: {
  glow: '0 0 24px var(--glow)',
  'glow-sm': '0 0 12px var(--glow)',
},
```

- [ ] **Step 4: Build + visual sanity**

Run: `npx tsc --noEmit && npm run build`
Expected: clean build. Then `npm run dev`, open `/chat` — Manrope renders (inspect computed font-family), default new-profile theme is luminous (clear localStorage to see).

- [ ] **Step 5: Commit**

```bash
git add app/layout.tsx app/globals.css tailwind.config.ts
git commit -m "feat(theme): Manrope + per-theme design tokens + semantic Tailwind utilities"
```

---

### Task 5: Migrate shell + UI primitives to tokens

**Files:**
- Modify: `components/layout/AppShell.tsx`, `components/layout/Sidebar.tsx`, `components/layout/Topbar.tsx`
- Modify: `components/settings/SettingsNav.tsx`, `app/settings/layout.tsx`
- Modify: `components/ui/Card.tsx`, `components/ui/Button.tsx`, `components/ui/Input.tsx`, `components/ui/Badge.tsx`, `components/ui/Avatar.tsx`

- [ ] **Step 1: Apply the class mapping to each file**

Mechanical substitution (judgement on ties; do NOT touch `dark:`-prefixed classes — they keep working):

| Old class | New class |
|---|---|
| `bg-gray-950` | `bg-bg` |
| `bg-gray-900`, `bg-gray-900/95` | `bg-surface`, `bg-surface/95` |
| `bg-gray-800` (fills & hovers) | `bg-raised` / `hover:bg-raised` |
| `bg-gray-800/50`, `/60` | `bg-raised/50`, `/60` |
| `border-gray-800` | `border-edge` |
| `border-gray-700` | `border-edge-strong` |
| `text-white`, `text-gray-100` | `text-t1` |
| `text-gray-200`, `text-gray-300`, `text-gray-400` | `text-t2` |
| `text-gray-500`, `text-gray-600` | `text-t3` |
| `rounded-lg` / `rounded-xl` on panels, cards, inputs, menus | `rounded-theme` |
| `bg-lucy-600 hover:bg-lucy-500` on primary buttons | `bg-accent hover:bg-accent-soft shadow-glow-sm btn-primary` |

Keep `rounded-full`, tiny chips, and code-block internals unchanged. Keep lucy-* gradient logos unchanged.

- [ ] **Step 2: Topbar specifics**

While editing `components/layout/Topbar.tsx` (lines 26-28): the sun/moon quick toggle must handle five themes — replace the click handler:

```tsx
<button
  onClick={() => setTheme(theme === 'light' ? 'luminous' : 'light', adapter)}
  className="p-1.5 rounded-md text-t2 hover:text-t1 hover:bg-raised transition-colors"
  aria-label="Toggle theme"
>
  {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
</button>
```

(Note icon logic flips: show Sun when dark — clicking goes light; show Moon when light.)

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm test && npm run lint`
Expected: all clean. `npm run dev`: switch `data-theme` manually in devtools (`document.documentElement.setAttribute('data-theme','industrial')`) and confirm shell surfaces change.

- [ ] **Step 4: Commit**

```bash
git add components/layout components/settings/SettingsNav.tsx app/settings/layout.tsx components/ui
git commit -m "feat(theme): migrate shell and UI primitives to semantic tokens"
```

---

### Task 6: Migrate the chat surface + flourish hooks

**Files:**
- Modify: `components/chat/ChatWindow.tsx`, `components/chat/ChatMessage.tsx`, `components/chat/ChatInput.tsx`, `components/chat/ChatSidebar.tsx`, `components/chat/ModelSelector.tsx`, `components/chat/PersonaSelector.tsx`

- [ ] **Step 1: Apply the Task 5 mapping table to all six files**

Same substitutions. Additional component hooks in `ChatMessage.tsx`:

- User message bubble container: add `msg-user` to its className (next to the existing `bg-accent`-style classes after mapping).
- Assistant message bubble container: add `msg-assistant`.
- Inside the bubble, directly above the markdown content, add the role label element:

```tsx
<div className="role-label">{isAssistant ? 'Lucy' : 'You'}</div>
```

(`.role-label` is `display:none` in every theme except editorial — defined in Task 4's CSS.)

- [ ] **Step 2: Verify rendering + tests**

Run: `npm test`
Expected: pass (ChatMessage tests don't assert classes; if `ModelSelector.test.tsx` queries by class, update selectors).

`npm run dev`: send no messages — check empty state, then check a seeded conversation in each theme via devtools `data-theme` swap: luminous shows gradient+glow user bubble, editorial shows YOU/LUCY labels + accent bar, industrial shows sharp panels.

- [ ] **Step 3: Commit**

```bash
git add components/chat
git commit -m "feat(theme): migrate chat surface to tokens with per-theme flourishes"
```

---

### Task 7: Theme picker in Settings → General (and strip its Profile section)

**Files:**
- Modify: `app/settings/general/page.tsx`

- [ ] **Step 1: Remove the Profile section**

Delete from `app/settings/general/page.tsx`: the profile state (`email`, `displayName`, `avatarUrl`, `company`, `saving`, `saved`, `error`), the profile load effect, the `save` function, the whole `{/* ── Profile section ── */}` JSX block, the `<hr>` divider, and the now-unused `getSupabaseClient` import. (This content lives at `/account/profile` after Task 8.)

- [ ] **Step 2: Replace the Dark/Light buttons with theme swatches**

Replace the `Appearance` block with:

```tsx
import { THEME_OPTIONS } from '@/lib/theme';

// …inside the component JSX, replacing the existing two-button Appearance div:
<div className="space-y-2">
  <h3 className="text-sm font-medium text-t1">Appearance</h3>
  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
    {THEME_OPTIONS.map((opt) => (
      <button
        key={opt.id}
        onClick={() => setTheme(opt.id, adapter)}
        className={`text-left rounded-theme border p-2 transition-colors ${
          theme === opt.id
            ? 'border-accent ring-1 ring-accent'
            : 'border-edge hover:border-edge-strong'
        }`}
        aria-pressed={theme === opt.id}
      >
        <ThemeSwatch id={opt.id} />
        <div className="mt-2 text-xs font-semibold text-t1">{opt.label}</div>
        <div className="text-[10px] text-t3">{opt.blurb}</div>
      </button>
    ))}
  </div>
</div>
```

Add the swatch preview component at the bottom of the file (module scope):

```tsx
/** Mini three-stripe preview of a theme's bg / surface / accent. */
function ThemeSwatch({ id }: { id: string }) {
  const palette: Record<string, [string, string, string]> = {
    luminous: ['#0c0a16', '#12101f', '#8b5cf6'],
    industrial: ['#0a0a0f', '#12121c', '#8b5cf6'],
    editorial: ['#050507', '#101014', '#8b5cf6'],
    dark: ['#030712', '#111827', '#8b5cf6'],
    light: ['#fafafc', '#f4f4f6', '#7c3aed'],
  };
  const [bg, surface, accent] = palette[id] ?? palette.dark;
  return (
    <div className="h-10 rounded-md overflow-hidden flex border border-edge">
      <div style={{ background: bg }} className="flex-1" />
      <div style={{ background: surface }} className="flex-1" />
      <div style={{ background: accent }} className="w-2" />
    </div>
  );
}
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean. `npm run dev` → `/settings/general`: five swatches, clicking each switches the whole app live and persists across reload (no-flash script picks it up).

- [ ] **Step 4: Commit**

```bash
git add app/settings/general/page.tsx
git commit -m "feat(theme): five-theme picker in Settings General; profile moves to /account"
```

---

### Task 8: Account section — nav, layout, pages, redirects (TDD for nav)

**Files:**
- Create: `components/account/AccountNav.tsx`
- Create: `app/account/layout.tsx`, `app/account/page.tsx`, `app/account/profile/page.tsx`, `app/account/security/page.tsx`
- Modify: `app/settings/profile/page.tsx`, `app/settings/account/page.tsx`, `app/settings/security/page.tsx` (→ redirects)
- Modify: `components/settings/SettingsNav.tsx` (remove Account)
- Modify: `components/layout/Topbar.tsx` (menu: Account link)
- Modify: `proxy.ts` (protect `/account`)
- Test: `__tests__/components/account/AccountNav.test.tsx`

- [ ] **Step 1: Write the failing AccountNav test**

```tsx
// __tests__/components/account/AccountNav.test.tsx
import { render, screen } from '@testing-library/react';
import { AccountNav } from '@/components/account/AccountNav';

jest.mock('next/navigation', () => ({
  usePathname: () => '/account/security',
}));

describe('AccountNav', () => {
  it('renders Profile, Security and Billing links', () => {
    render(<AccountNav />);
    expect(screen.getByRole('link', { name: /profile/i })).toHaveAttribute('href', '/account/profile');
    expect(screen.getByRole('link', { name: /security/i })).toHaveAttribute('href', '/account/security');
    expect(screen.getByRole('link', { name: /billing/i })).toHaveAttribute('href', '/account/billing');
  });

  it('marks the current section as active', () => {
    render(<AccountNav />);
    expect(screen.getByRole('link', { name: /security/i })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /profile/i })).not.toHaveAttribute('aria-current');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/components/account/AccountNav.test.tsx`
Expected: FAIL — `Cannot find module '@/components/account/AccountNav'`

- [ ] **Step 3: Implement AccountNav**

```tsx
// components/account/AccountNav.tsx
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { User, Shield, CreditCard } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const SECTIONS: [string, string, LucideIcon][] = [
  ['/account/profile', 'Profile', User],
  ['/account/security', 'Security', Shield],
  ['/account/billing', 'Billing', CreditCard],
];

export function AccountNav() {
  const pathname = usePathname();
  return (
    <nav className="w-44 shrink-0 space-y-1" aria-label="Account sections">
      {SECTIONS.map(([href, label, Icon]) => (
        <Link
          key={href}
          href={href}
          aria-current={pathname === href ? 'page' : undefined}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-theme text-sm ${
            pathname === href
              ? 'bg-accent/20 text-t1 font-semibold'
              : 'text-t2 hover:text-t1 hover:bg-raised/60'
          }`}
        >
          <Icon className="w-4 h-4 shrink-0" />
          {label}
        </Link>
      ))}
    </nav>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/components/account/AccountNav.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Create the account layout and index redirect**

Mirror `app/settings/layout.tsx`'s structure (read it first and copy its AppShell usage; substitute AccountNav and the title "Account"):

```tsx
// app/account/layout.tsx
'use client';
import { AppShell } from '@/components/layout/AppShell';
import { AccountNav } from '@/components/account/AccountNav';

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell title="Account">
      <div className="max-w-4xl mx-auto px-6 py-8 flex gap-8">
        <AccountNav />
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </AppShell>
  );
}
```

```tsx
// app/account/page.tsx
import { redirect } from 'next/navigation';

export default function AccountIndex() {
  redirect('/account/profile');
}
```

- [ ] **Step 6: Move the page contents**

- `app/account/security/page.tsx`: move the ENTIRE contents of `app/settings/account/page.tsx` (password card, TOTP card, email-2FA toggle, devices list). Only change: page heading text to "Security".
- `app/account/profile/page.tsx`: move the Profile form. Source of truth is the richer form currently inside `app/settings/general/page.tsx` (email read-only, display name, avatar URL, company, save → `user_profiles` upsert — the exact code removed in Task 7 Step 1). Wrap in the same section/heading style: `<h2 className="text-base font-semibold text-t1">Profile</h2>`.
- Replace the three old settings pages with redirect stubs:

```tsx
// app/settings/profile/page.tsx
import { redirect } from 'next/navigation';
export default function Page() { redirect('/account/profile'); }
```

```tsx
// app/settings/account/page.tsx
import { redirect } from 'next/navigation';
export default function Page() { redirect('/account/security'); }
```

```tsx
// app/settings/security/page.tsx
import { redirect } from 'next/navigation';
export default function Page() { redirect('/account/security'); }
```

- [ ] **Step 7: Prune SettingsNav and update the Topbar menu**

`components/settings/SettingsNav.tsx` — SECTIONS becomes (Account removed, Lock icon import dropped):

```tsx
const SECTIONS: [string, string, LucideIcon][] = [
  ['/settings/general', 'General', User],
  ['/settings/providers', 'Providers', Plug],
  ['/settings/memory', 'Memory', Brain],
  ['/settings/voice', 'Voice', Mic],
  ['/settings/api-access', 'API Access', KeyRound],
];
```

`components/layout/Topbar.tsx` menu (line ~41): change the "Profile → /settings/general" item to:

```tsx
<Link href="/account/profile" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 text-xs text-t2 hover:text-t1 hover:bg-raised">
  <User className="w-3.5 h-3.5" /> Account
</Link>
```

(Setup guide + Sign out items stay.)

- [ ] **Step 8: Protect /account in proxy.ts**

In `proxy.ts`, change:

```typescript
const protectedPrefixes = ['/chat', '/workflows', '/settings', '/account'];
```

- [ ] **Step 9: Verify**

Run: `npx tsc --noEmit && npm test && npm run lint`
Expected: clean. `npm run dev`: avatar menu → Account lands on `/account/profile`; `/settings/account` redirects to `/account/security`; SettingsNav shows 5 items; logged-out access to `/account` redirects to login.

- [ ] **Step 10: Commit**

```bash
git add components/account app/account app/settings/profile app/settings/account app/settings/security components/settings/SettingsNav.tsx components/layout/Topbar.tsx proxy.ts __tests__/components/account
git commit -m "feat(account): /account section with Profile, Security; settings cleanup"
```

---

### Task 9: Billing scaffold

**Files:**
- Create: `app/account/billing/page.tsx`

- [ ] **Step 1: Implement the scaffold page**

```tsx
// app/account/billing/page.tsx
'use client';
import { CreditCard, Sparkles } from 'lucide-react';
import { useConversationsStore } from '@/lib/store/conversations';

export default function BillingPage() {
  const conversations = useConversationsStore((s) => s.conversations);
  const messageCount = conversations.reduce((n, c) => n + c.messages.length, 0);

  return (
    <div className="space-y-6">
      <h2 className="text-base font-semibold text-t1">Billing</h2>

      {/* Current plan */}
      <div className="rounded-theme border border-edge bg-surface p-5 space-y-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent-soft" />
          <span className="text-sm font-semibold text-t1">Free</span>
          <span className="text-[10px] font-bold uppercase tracking-wide text-accent-soft bg-accent/15 rounded-full px-2 py-0.5">
            Current plan
          </span>
        </div>
        <p className="text-xs text-t2">
          All features included while Lucy is self-hosted. You bring your own provider API keys.
        </p>
      </div>

      {/* Usage */}
      <div className="rounded-theme border border-edge bg-surface p-5 space-y-3">
        <h3 className="text-sm font-medium text-t1">Usage</h3>
        <div className="grid grid-cols-2 gap-4 max-w-sm">
          <div>
            <div className="text-xl font-bold text-t1">{conversations.length}</div>
            <div className="text-xs text-t3">Conversations</div>
          </div>
          <div>
            <div className="text-xl font-bold text-t1">{messageCount.toLocaleString()}</div>
            <div className="text-xs text-t3">Messages</div>
          </div>
        </div>
      </div>

      {/* Future */}
      <div className="rounded-theme border border-edge bg-surface p-5 space-y-2 opacity-70">
        <div className="flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-t3" />
          <h3 className="text-sm font-medium text-t1">Subscription</h3>
        </div>
        <p className="text-xs text-t3">
          Payment and team plans are not enabled on this deployment yet.
        </p>
        <button disabled className="text-xs px-3 py-1.5 rounded-theme border border-edge text-t3 cursor-not-allowed">
          Manage subscription
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify + commit**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean. `/account/billing` renders the three cards.

```bash
git add app/account/billing
git commit -m "feat(account): billing scaffold page"
```

---

### Task 10: Docs, full verification, merge

**Files:**
- Modify: `CLAUDE.md` (App shell/Settings IA section, project structure tree, theme docs)

- [ ] **Step 1: Update CLAUDE.md**

- Settings sub-routes list: remove profile/security/account rows; note the redirects; add the `/account` area (layout + profile/security/billing) and `components/account/AccountNav.tsx`.
- ThemeProvider pattern section: describe class + `data-theme`, the five themes, tokens in globals.css, `lib/theme.ts`, default `luminous`.
- Tech stack/structure: note Manrope via next/font.
- "I want to change the brand color" → mention tokens in `globals.css` alongside the `lucy` scale.

- [ ] **Step 2: Full verification**

Run: `npx tsc --noEmit && npm test && npm run lint && npm run build`
Expected: all clean, all tests pass.

- [ ] **Step 3: Live smoke test**

`npm run dev`, then verify each:
1. All five themes via the Settings picker — chat, settings, account all legible, no unstyled flash on reload.
2. `/account/profile`, `/account/security`, `/account/billing` render; old `/settings/profile|account|security` URLs redirect.
3. Avatar menu shows Account; sign-out still works.
4. Manrope active (devtools computed style on body).

- [ ] **Step 4: Merge**

```bash
git checkout master
git merge --no-ff feat/branding-themes -m "Merge feat/branding-themes: three brand themes, Manrope, /account section"
git push origin master
```

---

## Self-Review Notes

- **Spec coverage:** §1 themes → Tasks 1-7; §2 Manrope → Task 4; §3 Account → Task 8; §4 Settings cleanup → Tasks 7-8; §5 Billing → Task 9; §6 edge cases → fallback in Task 1 helper + Task 3 script; §7 testing → Tasks 1, 8, 10.
- **Type consistency:** `Theme`/`BRAND_THEMES`/`THEME_OPTIONS`/`applyThemeToDocument` defined in Task 1 and used in Tasks 2, 3, 7. Token utility names (`bg-bg`, `surface`, `raised`, `edge`, `edge-strong`, `t1-t3`, `accent`, `accent-soft`, `rounded-theme`, `shadow-glow(-sm)`) defined in Task 4 and used in Tasks 5-9 consistently.
- **Known judgement calls for the implementer:** the mapping table in Task 5 requires taste on ties (chips vs panels); when unsure, prefer leaving the old class. `lib/storage/index.ts` may need its `UserPreferences.theme` type widened (Task 2 Step 2 covers it).
