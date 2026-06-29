# Upgrade: Next.js 16 + React 19 + Dependency Modernization

**Date:** 2026-06-10
**Branch:** `chore/next-16-upgrade` → merged to `master` (`d95e84a`)
**Scope:** Framework two-major jump (Next 14 → 16), React 18 → 19, all SDKs and tooling to latest.

## Version Changes

| Package | Before | After | Notes |
|---|---|---|---|
| next | 14.2.30 | 16.2.9 | Turbopack is now the default bundler for dev and build |
| react / react-dom | 18.3.1 | 19.2.7 | |
| @types/react / @types/react-dom | 18.x | 19.x | `useRef` ref types now include `\| null` |
| eslint | 8.57 | 9.x | Flat config required |
| eslint-config-next | 14.2.30 | 16.2.9 | Now natively flat config; enables React Compiler hook rules |
| jest / jest-environment-jsdom | 29.7 | 30.4 | TS config must import `next/jest.js` (explicit extension) |
| openai | 4.x | 6.42 | No call-site changes needed (chat.completions / audio APIs stable) |
| @anthropic-ai/sdk | 0.27 | 0.104 | No call-site changes needed |
| @google/generative-ai | 0.21 | 0.24 | |
| @supabase/supabase-js | 2.107 | 2.108 | |
| @supabase/ssr | 0.10 | 0.12 | |
| lucide-react | 0.462 | 1.17 | **Brand icons removed** (Chrome, etc.) |
| nodemailer | 7.x | 8.x | `createTransport` API unchanged |
| react-markdown | 9.x | 10.x | No call-site changes needed |
| @types/node | 20 | 24 | Matches installed Node 24 |
| Docker base image | node:20-alpine | node:22-alpine | Next 16 requires Node >= 20.9 |

### Removed

- **next-auth** — was in package.json but never imported anywhere; Supabase Auth is the only auth path. `NEXTAUTH_*` env vars removed from `.env.example` and CLAUDE.md.
- **ts-jest** — unused; `jest.config.ts` uses the `next/jest` SWC transform.
- **.eslintrc.json** — replaced by `eslint.config.mjs` (flat config).

## Breaking Changes Fixed

1. **`middleware.ts` → `proxy.ts`** — Next 16 renamed the middleware convention. File renamed and the exported function renamed `middleware` → `proxy`. Behavior unchanged (route protection when Supabase is enabled). Build output now shows "ƒ Proxy (Middleware)".
2. **`next.config.js`** — `experimental.serverComponentsExternalPackages` moved to top-level `serverExternalPackages`.
3. **Async request APIs** — `cookies()` must be awaited. Fixed in `app/auth/callback/route.ts`. The rest of the codebase was already Next-15-style (`await cookies()` in `lib/supabase/server.ts`, `params: Promise<…>` in `app/api/screening/[id]/route.ts`).
4. **CSS `@import` ordering** — Turbopack enforces the CSS spec: `@import` must precede all other rules. The `highlight.js` theme import in `app/globals.css` was moved above the `@tailwind` directives.
5. **Jest 30 TS config loading** — `import nextJest from 'next/jest'` fails under Jest 30's ESM loader; changed to `'next/jest.js'`.
6. **lucide-react 1.x brand icon removal** — the Google sign-in button used the `Chrome` icon; replaced with an inline Google "G" SVG (`GoogleIcon`) in `app/auth/login/page.tsx`.
7. **React 19 ref typing** — `useRef<T>(null)` is now `RefObject<T | null>`; the `bottomRef` prop type in `components/embed/LucyWidget.tsx` widened accordingly.
8. **`next lint` removed in Next 16** — the `lint` script now runs `eslint .` directly against `eslint.config.mjs`, which imports `eslint-config-next/core-web-vitals` (natively flat; no FlatCompat needed).
9. **tsconfig.json** — auto-migrated by Next 16 (`jsx: react-jsx`, added `.next/dev/types` include).

## Lint: New React Compiler Rules (Known Warnings)

eslint-config-next 16 ships react-hooks v6 with React Compiler-powered rules. Three of them flag **pre-existing** patterns at error level; they are downgraded to `warn` in `eslint.config.mjs` until the components are refactored:

- `react-hooks/set-state-in-effect` — setState called synchronously inside `useEffect`
- `react-hooks/immutability` — mutation of values the compiler considers frozen
- `react-hooks/purity` — impure calls during render

**Refactor backlog — RESOLVED (2026-06-10, same day)**: all 16 warnings were fixed (setState-in-effect loaders converted to promise-chain effects or lazy `useState` initializers, declaration-order issues in `app/chat/page.tsx` reorganized, `ConnectorDetail` reset-effect replaced with a `key` prop, `window.location.href` → `router.push`, QR `<img>` given a justified disable). The rule downgrades were then removed from `eslint.config.mjs` — the React Compiler rules now run at full error strength and `npm run lint` is clean.

## Deliberately Deferred

| Upgrade | Why deferred |
|---|---|
| **Tailwind 4** | CSS-first config migration; rewrites `tailwind.config.ts` (custom `lucy` palette), PostCSS pipeline, and touches every style. Should be its own branch using `npx @tailwindcss/upgrade`. |
| **Zod 4** | `@modelcontextprotocol/sdk` requires Zod 3 schemas; upgrading would break MCP connector tool definitions (`lib/mcp/`). Revisit when the MCP SDK supports Zod 4. |
| **TypeScript 6 / ESLint 10** | Both very new; ecosystem (ts plugins, eslint-config-next peers) not settled yet. |

## Verification Performed

- `npx tsc --noEmit` — clean.
- `npm test` — 194 tests / 29 suites, all passing (Jest 30 + React 19).
- `npm run build` — production build succeeds on Turbopack, all routes compile.
- `npm run lint` — 0 errors, 16 advisory warnings (see backlog above).
- Live smoke test (`npm run dev`): all key pages and APIs return 200 (`/`, `/chat`, `/personas`, `/workflows`, `/settings/providers`, `/connectors`, `/auth/login`, `/onboarding`, `/embed`, `/api/models`, `/manifest.webmanifest`, `/icon`); `proxy.ts` auth gating redirects protected routes to login in connected mode; `POST /api/chat` streams SSE correctly through the OpenAI v6 SDK (graceful error event without a valid key).
