# Settings + Admin + App-Shell IA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat top-nav and the 796-line settings page with a left-sidebar app shell + divided Settings sub-routes + a gated Admin area, reserving placement for Connectors and Voice.

**Architecture:** A new `AppShell` (Sidebar + thin Topbar) wraps each authenticated app page — matching the existing per-page `<Header/>` pattern, so `/auth/*` and `/embed` are untouched and there's no risky route-group move. Settings becomes a `layout.tsx` + sub-route pages, each rendering existing, well-built components relocated out of the monolith. Admin config moves to a gated `/admin`. This is **relocation, not rewrite.**

**Tech Stack:** Next.js 14 (App Router), TypeScript, Tailwind (`lucy-` palette), Zustand, Supabase (`lucy` schema), lucide-react icons, Jest.

**Spec:** `docs/superpowers/specs/2026-06-09-settings-admin-appshell-design.md` · **Vision:** `docs/superpowers/specs/2026-06-09-lucy-design-overhaul-vision.md`

---

## Conventions
- Tests: Jest, `__tests__/...`, run `npx jest <path>`. UI is not unit-tested in this repo (only `/api/admin/me` gets a test here).
- Verify each task with `npx tsc --noEmit` and (for visible changes) `npm run build`. Dev server runs on port 3001.
- Imports use the `@/` alias (repo root) — moving files between folders does NOT break `@/` imports.
- Commit per task; end messages with the `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` trailer.
- Keep unchanged: `Card/Button/Badge/Input`, `ApiKeyCard`, `ChatWindow/ChatMessage`, `IntegrationCard`, the `lucy-` palette.

## File map (what gets created / modified / moved)
- **Create:** `app/api/admin/me/route.ts`, `lib/hooks/useIsAdmin.ts`, `components/layout/Sidebar.tsx`, `components/layout/Topbar.tsx`, `components/layout/AppShell.tsx`, `components/settings/SettingsNav.tsx`, `components/settings/AdminMemoryPanel.tsx`, `components/settings/ProvidersSection.tsx`, `components/settings/LocalModelsSection.tsx`, `components/settings/ApiKeysSection.tsx` (extracted), `app/settings/layout.tsx`, `app/settings/{providers,memory,preferences,api-access,profile,security}/page.tsx`, `app/admin/page.tsx`, `app/connectors/page.tsx`, `__tests__/app/api/admin/me.test.ts`.
- **Modify:** `app/settings/page.tsx` (→ redirect), `components/settings/MemoryPanel.tsx` (extract admin parts), `components/chat/ChatInput.tsx` (mic affordance), `app/chat/page.tsx` + `app/personas/page.tsx` + `app/workflows/page.tsx` + `app/workflows/[id]/page.tsx` (swap `<Header/>` → `<AppShell/>`).
- **Move:** `app/settings/integrations/page.tsx` → `app/connectors/page.tsx`.

---

## PHASE 1 — Admin gating endpoint + hook

### Task 1: `GET /api/admin/me`

**Files:**
- Create: `app/api/admin/me/route.ts`
- Test: `__tests__/app/api/admin/me.test.ts`

- [ ] **Step 1: Write the failing test** (pure helper extracted for testability)

```ts
// __tests__/app/api/admin/me.test.ts
import { isAdminEmail } from '@/app/api/admin/me/route';

describe('isAdminEmail', () => {
  it('is admin for everyone when LUCY_ADMIN_EMAIL is unset (current default)', () => {
    expect(isAdminEmail('anyone@x.com', undefined)).toBe(true);
    expect(isAdminEmail(null, '')).toBe(true);
  });
  it('matches against a comma-separated list, case-insensitive', () => {
    const list = 'admin@bizinly.com, admin@contractorsroom.com';
    expect(isAdminEmail('ADMIN@bizinly.com', list)).toBe(true);
    expect(isAdminEmail('nope@x.com', list)).toBe(false);
  });
  it('is not admin when a list is set but email is null', () => {
    expect(isAdminEmail(null, 'admin@x.com')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx jest __tests__/app/api/admin/me.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement the route + helper**

```ts
// app/api/admin/me/route.ts
import { NextRequest } from 'next/server';
import { resolveMemoryAuth } from '@/lib/memory/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Mirrors the gate in /api/memory/settings: unset list => everyone is admin. */
export function isAdminEmail(email: string | null, adminEnv: string | undefined): boolean {
  const list = (adminEnv ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (list.length === 0) return true;
  return Boolean(email && list.includes(email.toLowerCase()));
}

export async function GET(req: NextRequest) {
  const { userId, email } = await resolveMemoryAuth(req);
  if (!userId) return Response.json({ isAdmin: false }, { status: 200 });
  return Response.json({ isAdmin: isAdminEmail(email, process.env.LUCY_ADMIN_EMAIL) });
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx jest __tests__/app/api/admin/me.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/me/route.ts __tests__/app/api/admin/me.test.ts
git commit -m "feat(admin): GET /api/admin/me returns { isAdmin } from LUCY_ADMIN_EMAIL"
```

### Task 2: `useIsAdmin` hook

**Files:** Create `lib/hooks/useIsAdmin.ts`

- [ ] **Step 1: Implement**

```ts
// lib/hooks/useIsAdmin.ts
'use client';
import { useEffect, useState } from 'react';

/** Fetches the admin flag once. Defaults to false until known. */
export function useIsAdmin(): boolean {
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/me')
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setIsAdmin(Boolean(d?.isAdmin)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  return isAdmin;
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit`
```bash
git add lib/hooks/useIsAdmin.ts
git commit -m "feat(admin): useIsAdmin hook"
```

---

## PHASE 2 — App shell components

### Task 3: `Sidebar`

**Files:** Create `components/layout/Sidebar.tsx`

- [ ] **Step 1: Implement** (app-level nav; Admin greyed+locked for non-admins)

```tsx
// components/layout/Sidebar.tsx
'use client';
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Bot, MessageSquare, Drama, Workflow, Plug, Settings as Cog, ShieldCheck, Lock,
} from 'lucide-react';
import { useIsAdmin } from '@/lib/hooks/useIsAdmin';

interface NavItem { href: string; label: string; icon: React.ElementType; admin?: boolean; }

const NAV: NavItem[] = [
  { href: '/chat', label: 'Chat', icon: MessageSquare },
  { href: '/personas', label: 'Personas', icon: Drama },
  { href: '/workflows', label: 'Workflows', icon: Workflow },
  { href: '/connectors', label: 'Connectors', icon: Plug },
];
const MANAGE: NavItem[] = [
  { href: '/settings', label: 'Settings', icon: Cog },
  { href: '/admin', label: 'Admin', icon: ShieldCheck, admin: true },
];

export function Sidebar({ open }: { open: boolean }) {
  const pathname = usePathname();
  const isAdmin = useIsAdmin();
  const active = (href: string) => pathname === href || pathname.startsWith(href + '/');

  const Item = ({ item }: { item: NavItem }) => {
    const locked = item.admin && !isAdmin;
    const cls = `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
      active(item.href) ? 'bg-lucy-700/30 text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'
    } ${locked ? 'opacity-50 cursor-not-allowed' : ''}`;
    const inner = (
      <>
        <item.icon className="w-4 h-4 shrink-0" />
        {open && <span className="truncate">{item.label}</span>}
        {locked && open && <Lock className="w-3 h-3 ml-auto opacity-70" />}
      </>
    );
    if (locked) {
      return <div className={cls} title="Admin access required" aria-disabled="true">{inner}</div>;
    }
    return <Link href={item.href} className={cls} aria-current={active(item.href) ? 'page' : undefined}>{inner}</Link>;
  };

  return (
    <aside className={`${open ? 'w-60' : 'w-14'} shrink-0 border-r border-gray-800 bg-gray-900 flex flex-col transition-[width] duration-200`}>
      <Link href="/chat" className="flex items-center gap-2 h-14 px-3 border-b border-gray-800">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-lucy-500 to-lucy-700 flex items-center justify-center shrink-0">
          <Bot className="w-4 h-4 text-white" />
        </div>
        {open && <span className="font-semibold text-white text-sm">Lucy</span>}
      </Link>
      <nav className="flex-1 p-2 space-y-1" aria-label="Primary">
        {NAV.map((i) => <Item key={i.href} item={i} />)}
        <div className="h-px bg-gray-800 my-2" />
        {MANAGE.map((i) => <Item key={i.href} item={i} />)}
      </nav>
    </aside>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit`
```bash
git add components/layout/Sidebar.tsx
git commit -m "feat(shell): app Sidebar with gated Admin entry"
```

### Task 4: `Topbar`

**Files:** Create `components/layout/Topbar.tsx`

- [ ] **Step 1: Implement** (thin: collapse toggle · title · theme · user menu — ported from `Header.tsx`)

```tsx
// components/layout/Topbar.tsx
'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PanelLeftClose, PanelLeftOpen, Sun, Moon, User, ChevronDown, LogOut, LogIn, Compass } from 'lucide-react';
import { useSettingsStore } from '@/lib/store/settings';
import { useStorage } from '@/lib/storage/provider';
import { useAuth } from '@/lib/supabase/auth';

export function Topbar({ title, sidebarOpen, onToggleSidebar }: { title: string; sidebarOpen: boolean; onToggleSidebar: () => void; }) {
  const { theme, setTheme } = useSettingsStore();
  const adapter = useStorage();
  const { user, signOut, authEnabled } = useAuth();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleSignOut = async () => { setMenuOpen(false); await signOut(); router.push('/auth/login'); };

  return (
    <header className="h-14 border-b border-gray-800 bg-gray-900/95 backdrop-blur-sm flex items-center px-4 gap-3 shrink-0 z-10 relative">
      <button onClick={onToggleSidebar} className="p-1.5 rounded-md text-gray-400 hover:text-gray-200 hover:bg-gray-800" aria-label="Toggle sidebar">
        {sidebarOpen ? <PanelLeftClose className="w-5 h-5" /> : <PanelLeftOpen className="w-5 h-5" />}
      </button>
      <h1 className="text-sm font-medium text-gray-200 truncate">{title}</h1>
      <div className="ml-auto flex items-center gap-2">
        <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark', adapter)} className="p-1.5 rounded-md text-gray-400 hover:text-gray-200 hover:bg-gray-800" aria-label="Toggle theme">
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
        {authEnabled && (user ? (
          <div className="relative">
            <button onClick={() => setMenuOpen((v) => !v)} className="flex items-center gap-1.5 px-2 py-1 rounded-md text-gray-300 hover:text-white hover:bg-gray-800 text-xs" aria-haspopup="true" aria-expanded={menuOpen}>
              <div className="w-5 h-5 rounded-full bg-lucy-700 flex items-center justify-center"><User className="w-3 h-3 text-white" /></div>
              <span className="hidden sm:inline max-w-[120px] truncate">{user.email}</span>
              <ChevronDown className="w-3 h-3 opacity-60" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1 w-48 bg-gray-900 border border-gray-800 rounded-lg shadow-xl z-20 py-1">
                  <div className="px-3 py-2 border-b border-gray-800"><p className="text-xs text-gray-400 truncate">{user.email}</p></div>
                  <Link href="/settings/profile" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-800"><User className="w-3.5 h-3.5" /> Profile</Link>
                  <Link href="/onboarding" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-800"><Compass className="w-3.5 h-3.5" /> Setup guide</Link>
                  <button onClick={handleSignOut} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-400 hover:text-red-400 hover:bg-gray-800"><LogOut className="w-3.5 h-3.5" /> Sign out</button>
                </div>
              </>
            )}
          </div>
        ) : (
          <Link href="/auth/login" className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-gray-400 hover:text-white hover:bg-gray-800 text-xs"><LogIn className="w-3.5 h-3.5" /> Sign in</Link>
        ))}
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit`
```bash
git add components/layout/Topbar.tsx
git commit -m "feat(shell): thin Topbar (title, theme, user menu)"
```

### Task 5: `AppShell`

**Files:** Create `components/layout/AppShell.tsx`

- [ ] **Step 1: Implement** (composes Sidebar + Topbar + content; owns collapse state)

```tsx
// components/layout/AppShell.tsx
'use client';
import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

/**
 * App frame for authenticated pages. `contentClassName` lets a page opt out of the
 * default padded scroll container (Chat manages its own full-height layout).
 */
export function AppShell({ title, children, padded = true }: { title: string; children: React.ReactNode; padded?: boolean; }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  return (
    <div className="h-full flex bg-gray-950">
      <Sidebar open={sidebarOpen} />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar title={title} sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen((v) => !v)} />
        <main className={padded ? 'flex-1 overflow-y-auto p-6' : 'flex-1 min-h-0'}>{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit`
```bash
git add components/layout/AppShell.tsx
git commit -m "feat(shell): AppShell composing Sidebar + Topbar"
```

---

## PHASE 3 — Adopt the shell on simple pages

> Pattern: in each page, replace `<Header ... />` + its outer wrapper with `<AppShell title="…">…</AppShell>`. Remove the `Header` import. Keep the page's inner content.

### Task 6: Personas page

**Files:** Modify `app/personas/page.tsx`

- [ ] **Step 1:** Read the file. Replace the top-level wrapper that renders `<Header />` with:
```tsx
import { AppShell } from '@/components/layout/AppShell';
// ...
return (
  <AppShell title="Personas">
    {/* existing personas content, minus the old <Header/> and its outer full-height div */}
  </AppShell>
);
```
Remove `import { Header } from '@/components/layout/Header'`.

- [ ] **Step 2:** `npx tsc --noEmit` → clean. `npm run dev` → open `/personas`, confirm sidebar + content render.
- [ ] **Step 3: Commit**
```bash
git add app/personas/page.tsx
git commit -m "feat(shell): personas page uses AppShell"
```

### Task 7: Workflows pages

**Files:** Modify `app/workflows/page.tsx` and `app/workflows/[id]/page.tsx`

- [ ] **Step 1:** Same swap as Task 6, `title="Workflows"`. For `[id]`, use `title="Workflow"`.
- [ ] **Step 2:** `npx tsc --noEmit`; open `/workflows`.
- [ ] **Step 3: Commit**
```bash
git add app/workflows/page.tsx app/workflows/[id]/page.tsx
git commit -m "feat(shell): workflows pages use AppShell"
```

### Task 8: Chat page (two-tier)

**Files:** Modify `app/chat/page.tsx`

Chat keeps its `ChatSidebar` (conversations) as a second panel inside the shell's content.

- [ ] **Step 1:** Replace the page's outer `<div>` + `<Header .../>` with `<AppShell title="Chat" padded={false}>`. Inside, keep the existing flex layout that renders `ChatSidebar` + `ChatWindow` + `ChatInput`. Remove the `Header` import and the now-unused `sidebarOpen`/`onToggleSidebar` props that were wired to `Header` (the ChatSidebar keeps its own open state if it has one; if it relied on Header's toggle, add a local toggle button in the chat toolbar). Use `padded={false}` so chat controls its own full-height layout.
- [ ] **Step 2:** `npx tsc --noEmit`; open `/chat` — confirm: app sidebar (left), conversation list (second panel), chat window, input all work; sending a message still works.
- [ ] **Step 3: Commit**
```bash
git add app/chat/page.tsx
git commit -m "feat(shell): chat page uses AppShell (two-tier sidebar)"
```

---

## PHASE 4 — Settings restructure

### Task 9: Extract settings sub-components from the monolith

`app/settings/page.tsx` (796 lines) defines `ApiKeyCard`, the providers list, `ApiKeysSection`, local-models UI, theme, and data sections inline. Extract the reusable pieces into `components/settings/` so sub-routes can render them.

**Files:** Create `components/settings/ProvidersSection.tsx`, `components/settings/LocalModelsSection.tsx`, `components/settings/ApiKeysSection.tsx`; modify `app/settings/page.tsx`.

- [ ] **Step 1:** Move the `ApiKeyCard` component + `PROVIDERS` array + the section that maps them into `ProvidersSection.tsx` (export `function ProvidersSection()`), and the Local Models block into `LocalModelsSection.tsx`. Move the existing `ApiKeysSection` component into its own file `components/settings/ApiKeysSection.tsx`. Keep all logic identical — just relocate and add `export`.
- [ ] **Step 2:** `npx tsc --noEmit` → fix import paths.
- [ ] **Step 3: Commit**
```bash
git add components/settings/ProvidersSection.tsx components/settings/LocalModelsSection.tsx components/settings/ApiKeysSection.tsx app/settings/page.tsx
git commit -m "refactor(settings): extract Providers/LocalModels/ApiKeys sections into components"
```

### Task 10: Settings layout + sub-nav

**Files:** Create `app/settings/layout.tsx`, `components/settings/SettingsNav.tsx`

- [ ] **Step 1: SettingsNav**
```tsx
// components/settings/SettingsNav.tsx
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const SECTIONS = [
  ['/settings/profile', 'Profile'],
  ['/settings/security', 'Security'],
  ['/settings/providers', 'Providers'],
  ['/settings/memory', 'Memory'],
  ['/settings/preferences', 'Preferences'],
  ['/settings/api-access', 'API Access'],
] as const;

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav className="w-44 shrink-0 space-y-1" aria-label="Settings sections">
      {SECTIONS.map(([href, label]) => (
        <Link key={href} href={href}
          className={`block px-3 py-1.5 rounded-lg text-sm ${pathname === href ? 'bg-lucy-700/30 text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'}`}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
```

- [ ] **Step 2: layout**
```tsx
// app/settings/layout.tsx
import { AppShell } from '@/components/layout/AppShell';
import { SettingsNav } from '@/components/settings/SettingsNav';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell title="Settings">
      <div className="max-w-4xl mx-auto flex gap-8">
        <SettingsNav />
        <div className="flex-1 min-w-0 space-y-6">{children}</div>
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 3:** `npx tsc --noEmit`; commit
```bash
git add app/settings/layout.tsx components/settings/SettingsNav.tsx
git commit -m "feat(settings): settings layout + sub-nav"
```

### Task 11: Settings sub-route pages

**Files:** Create `app/settings/{providers,memory,preferences,api-access,profile,security}/page.tsx`; modify `app/settings/page.tsx` → redirect.

- [ ] **Step 1:** Create each page rendering the relocated component(s):
```tsx
// app/settings/providers/page.tsx
import { ProvidersSection } from '@/components/settings/ProvidersSection';
import { LocalModelsSection } from '@/components/settings/LocalModelsSection';
export default function Page() { return (<><ProvidersSection /><LocalModelsSection /></>); }
```
```tsx
// app/settings/memory/page.tsx
import { MemoryPanel } from '@/components/settings/MemoryPanel';
export default function Page() { return <MemoryPanel />; }
```
```tsx
// app/settings/api-access/page.tsx
import { ApiKeysSection } from '@/components/settings/ApiKeysSection';
export default function Page() { return <ApiKeysSection />; }
```
```tsx
// app/settings/preferences/page.tsx  (theme + defaults + Voice placeholder)
'use client';
import { useSettingsStore } from '@/lib/store/settings';
import { useStorage } from '@/lib/storage/provider';
export default function Page() {
  const { theme, setTheme } = useSettingsStore();
  const adapter = useStorage();
  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-sm font-medium text-white mb-2">Appearance</h2>
        <div className="flex gap-2">
          <button onClick={() => setTheme('dark', adapter)} className={`px-3 py-1.5 rounded-lg text-sm border ${theme==='dark'?'border-lucy-500 text-white':'border-gray-700 text-gray-400'}`}>Dark</button>
          <button onClick={() => setTheme('light', adapter)} className={`px-3 py-1.5 rounded-lg text-sm border ${theme==='light'?'border-lucy-500 text-white':'border-gray-700 text-gray-400'}`}>Light</button>
        </div>
      </section>
      <section className="opacity-60">
        <h2 className="text-sm font-medium text-white mb-1">Voice</h2>
        <p className="text-xs text-gray-500">Voice output &amp; input — coming soon.</p>
      </section>
    </div>
  );
}
```
```tsx
// app/settings/profile/page.tsx  (scaffold — functionality is sub-project 2)
'use client';
import { useEffect, useState } from 'react';
import { useStorage } from '@/lib/storage/provider';
export default function Page() {
  const adapter = useStorage();
  const [company, setCompany] = useState('');
  useEffect(() => { adapter.getPreferences().then((p) => setCompany(p.companyName ?? '')).catch(() => {}); }, [adapter]);
  return (
    <div className="space-y-4 max-w-md">
      <h2 className="text-sm font-medium text-white">Profile</h2>
      <label className="block text-xs text-gray-400">Company (optional)
        <input value={company} onChange={(e) => setCompany(e.target.value)}
          onBlur={() => adapter.updatePreferences({ companyName: company.trim() }).catch(() => {})}
          className="mt-1 w-full bg-gray-950 border border-gray-800 rounded px-2 py-1 text-gray-200" />
      </label>
      <p className="text-xs text-gray-600">Name, avatar &amp; email editing arrive with the account update.</p>
    </div>
  );
}
```
```tsx
// app/settings/security/page.tsx  (scaffold — sub-project 2)
export default function Page() {
  const items = ['Change password', 'Two-factor authentication', 'Devices & sessions'];
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium text-white">Security</h2>
      {items.map((t) => (
        <div key={t} className="p-3 rounded-lg bg-gray-900 border border-gray-800 opacity-60 flex items-center justify-between">
          <span className="text-sm text-gray-300">{t}</span><span className="text-xs text-gray-500">Coming soon</span>
        </div>
      ))}
    </div>
  );
}
```
```tsx
// app/settings/page.tsx  (replace entire file)
import { redirect } from 'next/navigation';
export default function Page() { redirect('/settings/providers'); }
```

- [ ] **Step 2:** `npx tsc --noEmit`; `npm run build`. Open `/settings` → redirects to Providers; click through each sub-nav item.
- [ ] **Step 3: Commit**
```bash
git add app/settings
git commit -m "feat(settings): split into profile/security/providers/memory/preferences/api-access sub-routes"
```

---

## PHASE 5 — MemoryPanel split + Admin area

### Task 12: Extract `AdminMemoryPanel`

**Files:** Create `components/settings/AdminMemoryPanel.tsx`; modify `components/settings/MemoryPanel.tsx`

- [ ] **Step 1:** Move the embedder section (presets, model/baseUrl/dimensions inputs, write-only API key, `saveEmbedder`, the explainer `<details>`), the contradiction-policy `<select>`, and the deletion-grace input out of `ConnectedMemoryPanel` into a new `AdminMemoryPanel` (it fetches `/api/memory/settings` itself, same as the panel does today). Leave in `MemoryPanel` (user): the enabled toggle, incognito, and storage usage. `LocalMemoryPanel` is unchanged.
- [ ] **Step 2:** `npx tsc --noEmit`. Confirm `/settings/memory` now shows only toggle + incognito + usage.
- [ ] **Step 3: Commit**
```bash
git add components/settings/MemoryPanel.tsx components/settings/AdminMemoryPanel.tsx
git commit -m "refactor(memory): split admin embedder/policy out of MemoryPanel into AdminMemoryPanel"
```

### Task 13: Admin area

**Files:** Create `app/admin/page.tsx`

- [ ] **Step 1:** Implement, gated by `useIsAdmin` (client guard; server endpoints already enforce):
```tsx
// app/admin/page.tsx
'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { AdminMemoryPanel } from '@/components/settings/AdminMemoryPanel';
import { useIsAdmin } from '@/lib/hooks/useIsAdmin';

export default function AdminPage() {
  const isAdmin = useIsAdmin();
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    fetch('/api/admin/me').then((r) => r.json()).then((d) => {
      if (!d?.isAdmin) router.replace('/chat'); else setChecked(true);
    }).catch(() => router.replace('/chat'));
  }, [router]);
  if (!checked) return <AppShell title="Admin"><p className="text-sm text-gray-500">Checking access…</p></AppShell>;
  return (
    <AppShell title="Admin">
      <div className="max-w-3xl mx-auto space-y-6">
        <section><h2 className="text-sm font-medium text-white mb-2">Memory</h2><AdminMemoryPanel /></section>
      </div>
    </AppShell>
  );
}
```
(Add `import { useState } from 'react';`.)

- [ ] **Step 2:** `npx tsc --noEmit`; `npm run build`. With `LUCY_ADMIN_EMAIL` set to your admin, log in as admin → `/admin` renders; the Sidebar Admin item is enabled. (For a non-admin email it greys + `/admin` redirects.)
- [ ] **Step 3: Commit**
```bash
git add app/admin/page.tsx
git commit -m "feat(admin): gated /admin area with AdminMemoryPanel"
```

---

## PHASE 6 — Connectors + voice affordance

### Task 14: Move Integrations → Connectors

**Files:** Move `app/settings/integrations/page.tsx` → `app/connectors/page.tsx`; create redirect.

- [ ] **Step 1:** `git mv app/settings/integrations/page.tsx app/connectors/page.tsx`. Wrap its content in `<AppShell title="Connectors">` (replace any old Header). Keep the `registerContractorsRoom()` import/side-effect intact.
- [ ] **Step 2:** Create `app/settings/integrations/page.tsx` as a redirect:
```tsx
import { redirect } from 'next/navigation';
export default function Page() { redirect('/connectors'); }
```
- [ ] **Step 3:** `npx tsc --noEmit`; `npm run build`. Open `/connectors`; `/settings/integrations` redirects.
- [ ] **Step 4: Commit**
```bash
git add app/connectors app/settings/integrations
git commit -m "feat(connectors): promote Integrations to top-level /connectors"
```

### Task 15: Voice mic affordance

**Files:** Modify `components/chat/ChatInput.tsx`

- [ ] **Step 1:** Add a disabled mic `<button>` left of the Send button:
```tsx
import { Mic } from 'lucide-react';
// ...inside the bottom bar's right-side controls, before the Send button:
<button type="button" disabled title="Voice — coming soon" aria-label="Voice (coming soon)"
  className="p-2 rounded-lg text-gray-600 cursor-not-allowed">
  <Mic className="w-4 h-4" />
</button>
```
- [ ] **Step 2:** `npx tsc --noEmit`; commit
```bash
git add components/chat/ChatInput.tsx
git commit -m "feat(voice): disabled mic affordance in ChatInput"
```

---

## PHASE 7 — Final verification

### Task 16: Full verify + docs

- [ ] **Step 1:** `npx jest` (all green), `npx tsc --noEmit`, `npm run lint`, `npm run build`.
- [ ] **Step 2: Manual checklist** (`npm run dev`, login):
  - Sidebar shows Chat/Personas/Workflows/Connectors + Settings/Admin; Admin greyed for a non-admin.
  - Each nav item routes; topbar theme toggle + user menu (Profile, Setup guide, Sign out) work.
  - `/settings` → redirects to Providers; all 6 settings sub-routes render.
  - `/settings/memory` shows only user controls; embedder/policy now under `/admin`.
  - `/settings/integrations` → `/connectors`.
  - Chat: app sidebar + conversation panel + sending all work.
  - `/embed` and `/auth/login` render WITHOUT the shell (unchanged).
- [ ] **Step 3:** Update `CLAUDE.md` (Project Structure + a short "App shell & Settings IA" note) and commit.
```bash
git add CLAUDE.md
git commit -m "docs: document app shell + settings/admin IA"
```

---

## Self-Review (completed during planning)
- **Spec coverage:** app shell (Tasks 3–8), settings split (9–11), MemoryPanel split (12), Admin + gating (1,2,13), Connectors move (14), voice affordance (15), Profile/Security scaffolds (11), keep-components (untouched). Covered.
- **Deferred per spec:** auth/security functionality (sub-project 2), connectors marketplace (3), real voice (4), ModelSelector combobox + tokens (5).
- **Risk handled:** shell is per-page (not a root-layout wrap), so `/auth/*` and `/embed` are never wrapped; `registerContractorsRoom()` side-effect preserved in the connectors move.
- **Type consistency:** `AppShell({title, children, padded})`, `Sidebar({open})`, `Topbar({title, sidebarOpen, onToggleSidebar})`, `useIsAdmin(): boolean`, `isAdminEmail(email, env)` used consistently across tasks.
