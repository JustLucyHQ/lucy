# Contributing

Lucy is open source — issues and pull requests welcome at [github.com/JustLucyHQ/lucy](https://github.com/JustLucyHQ/lucy).

## Development setup

```bash
git clone https://github.com/JustLucyHQ/lucy.git
cd LucyAI
npm install
npm run dev          # http://localhost:3001
```

No `.env` is required to run in standalone (local-first) mode — Lucy starts with no account and no keys. Add provider keys in **Settings → Providers**, or set Supabase env vars to enable connected mode (see [Self-hosting](/docs/self-hosting)).

## Scripts

Everything is driven from `package.json`:

| Script | What it does |
|---|---|
| `npm run dev` | Next dev server on **:3001** |
| `npm run build` | Production build (`next build`) |
| `npm start` | Serve the production build |
| `npm test` | Run the Jest suite once |
| `npm run test:watch` | Jest in watch mode |
| `npm run lint` | ESLint over the repo (`eslint .`) |
| `npx tsc --noEmit` | Type-check only — no script alias |
| `npm run lucy` | Run the CLI from source (`cli/index.ts`) |
| `npm run mcp` | Run Lucy's MCP server (`lib/mcp/server.ts`) |
| `npm run electron:dev` | Build + launch the desktop app |
| `npm run dist` | Package desktop installers (electron-builder) |

## Quality gates (all must pass)

```bash
npx tsc --noEmit     # types — zero errors
npm run lint         # ESLint 9 flat config (eslint.config.mjs, next/core-web-vitals)
npm test             # Jest 30 + React Testing Library
npm run build        # production build
```

## Testing

- **Jest 30 + RTL**, jsdom environment (`jest.config.ts`, via `next/jest`). `jest.setup.ts` pulls in `@testing-library/jest-dom`.
- **Test files live under `__tests__/`** and mirror the source path — e.g. `lib/providers/deepseek.ts` → `__tests__/lib/providers/deepseek.test.ts`. The matcher is `**/__tests__/**/*.(test|spec).(ts|tsx)`.
- The `@/` alias maps to the repo root, same as in app code.
- **Mock SDKs — no real network calls, no real keys.** Provider, MCP, and email tests stub the underlying client; nothing should hit a live API.

## Conventions that matter

- **Use theme tokens, not gray literals** in app chrome: `bg-surface`, `border-edge`, `text-t1/t2/t3`, `rounded-theme`. Hardcoded grays break the brand themes.
- **Never trust client identity** in API routes — derive the user server-side (`resolveMemoryAuth`), as every existing route does.
- **Both storage adapters stay in sync**: a new `StorageAdapter` method must be implemented in `lib/storage/local.ts` and `lib/storage/supabase.ts`.
- **All Supabase tables live in the `lucy` schema**; schema changes go into the SQL files under `lib/supabase/` (one feature per file, e.g. `workflow_runs.sql`).
- **No `any`** — use `unknown` and narrow.
- `CLAUDE.md` in the repo root is the deep map of the codebase — patterns, structure, and how-tos for every subsystem.

## Repo layout

| Path | What's there |
|---|---|
| `app/` | Next.js App Router — UI routes (`chat`, `workflows`, `settings`, `docs`, …) and `app/api/` route handlers |
| `components/` | React components, grouped by area (`chat`, `workflow`, `settings`, `ui`, …) |
| `lib/` | Core logic: `providers`, `workflow`, `mcp`, `memory`, `storage`, `supabase`, `integrations`, `channels`, `voice`, `docs` |
| `lib/supabase/*.sql` | Schema for the `lucy` Postgres schema |
| `__tests__/` | Jest tests, mirroring `lib/` and `components/` paths |
| `cli/` | Terminal client (`npm run lucy`) |
| `electron/` | Desktop app main process |
| `docs/kb/` | This documentation, as markdown |
| `proxy.ts` | Route-protection middleware (connected mode) |

## Where things go

| Adding a… | Put it in |
|---|---|
| Provider | New `lib/providers/<name>.ts` (class implementing `AIProvider`, with its own model list) → add the name to the `ProviderName` union in `types.ts` → instantiate it in the `providers` map in `index.ts` |
| Workflow node | New node type in `lib/workflow/types.ts` (type + config) → metadata/defaults in `registry.ts` → a `case` in the engine switch in `engine.ts` → a renderer in `components/workflow/` |
| Connector | Catalog entry in `lib/mcp/catalog.ts` (`CatalogServer` shape — `slug`, `install_ref`, `config_schema`, `tools`) |
| Page | `app/<route>/page.tsx` (add the prefix to `protectedPrefixes` in `proxy.ts` if it needs auth) |
| Doc page | Markdown under `docs/kb/` + a `{ slug, title, file }` entry in `DOC_SECTIONS` in `lib/docs/registry.ts` |
