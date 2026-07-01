# Contributing to Lucy

Thanks for considering a contribution — issues and pull requests are welcome.

By participating, you're expected to uphold our [Code of Conduct](CODE_OF_CONDUCT.md).

## Quick start

```bash
git clone https://github.com/JustLucyHQ/lucy.git
cd lucy
npm install
npm run dev          # http://localhost:3001
```

No `.env` is required to run in standalone (local-first) mode — Lucy starts with no
account and no keys. Add provider keys in **Settings → Providers**, or set Supabase
env vars to enable connected mode. See the full [developer guide](docs/kb/developers/contributing.md)
for the complete architecture, script reference, and coding conventions.

## Before you open a pull request

All of these must pass — they're enforced by required CI checks on `main`:

```bash
npx tsc --noEmit     # types — zero errors
npm run lint         # ESLint, zero warnings
npm test             # Jest + React Testing Library
npm run build        # production build
```

- Keep PRs focused — one change per PR is easier to review and merge.
- Fork the repo, branch from `main`, and open a PR back to `main`.
- `main` requires a passing CI + CodeQL check and at least one approving review before merge.
- For anything security-related, **do not open a public issue** — see [SECURITY.md](SECURITY.md).

## Reporting bugs / requesting features

Use the issue templates — they'll prompt for what we need to reproduce or evaluate the request.
