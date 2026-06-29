# Lucy Desktop (Electron) — Design

**Date:** 2026-06-24
**Status:** Approved (proceeding to build)
**Goal:** Ship Lucy as a downloadable desktop app with standalone installers (Windows NSIS .exe, macOS .dmg, Linux AppImage). Hybrid: runs Lucy's full server locally (local-first, offline-capable) with an optional "Connect to Cloud" to justlucy.ai.

## Architecture

Electron's main process **spawns Lucy's bundled Next.js standalone server** on a free `127.0.0.1` port and loads it in a `BrowserWindow`. The server runs using **Electron's own Node** (`spawn(process.execPath, [server.js], { env: { ELECTRON_RUN_AS_NODE: '1', PORT, HOSTNAME: '127.0.0.1' } })`) — no separate Node install required.

- **Local-first default:** the bundled build has no Supabase baked in → localStorage/standalone mode, works offline with Ollama + the user's own API keys, no login.
- **Optional cloud:** an app-menu item **Connect to Cloud** navigates the window to `https://justlucy.ai` (connected/Supabase mode, hosted). This sidesteps the build-time nature of `NEXT_PUBLIC_SUPABASE_URL` — local build for offline, hosted URL for cloud.
- **Resilience:** if the local server fails to start, fall back to loading the cloud URL.

## Files (isolated under `electron/` + build config)

- `electron/main.js` — app lifecycle; free-port pick (`net.createServer(0)`); spawn the Next server; `waitForServer` (poll HTTP until ready, 30s timeout); create window; app menu (Local / Connect to Cloud / Reload / DevTools); open external links via `shell.openExternal`; kill the server on quit.
- `electron/preload.js` — minimal, `contextIsolation: true`, `nodeIntegration: false` (nothing exposed in v1).
- `electron/copy-standalone.js` — post-build step: copy `.next/static` → `.next/standalone/.next/static` and `public` → `.next/standalone/public` (Next does not copy these into standalone automatically; the server needs them to serve assets).
- `electron-builder.yml` — `appId: ai.justlucy.desktop`, `productName: Lucy`; targets win=nsis, mac=dmg, linux=AppImage; `extraResources: .next/standalone → standalone`; output `dist-desktop/`.
- `package.json` — add `"main": "electron/main.js"` and scripts: `desktop:prepare` (next build + copy), `electron:dev` (prepare + `electron .`), `dist` (prepare + `electron-builder`).

## Packaged-app path resolution

`app.isPackaged` → server entry at `process.resourcesPath/standalone/server.js`; dev → `<project>/.next/standalone/server.js`. The server's `cwd` is its own dir so it finds `./.next/static` and `./public`.

## Error handling

- Server spawn failure / port timeout → load cloud URL, log to console; window still opens.
- Window closed → kill the server child; on macOS keep the app alive per platform convention.

## Testing / verification

- **Verifiable here:** `next build` passes; `copy-standalone.js` produces `.next/standalone/.next/static` + `public`; the standalone server runs (`node .next/standalone/server.js` serves `/auth/login` 200) — this proves the local-server core independent of Electron.
- **Hand-off (GUI / installer):** `npm run electron:dev` to click through; `npm run dist` to produce installers (electron-builder downloads per-platform binaries — run on each target OS or in CI). The agent cannot launch a GUI or reliably run the full installer build.

## Caveats (flagged, not hidden)

- **Icons:** `build/icon.{ico,icns,png}` needed for branded installers (same asset gap as the PWA icons). Omitted in v1 → electron-builder uses the default Electron icon; add real art later.
- **macOS signing/notarization:** unsigned `.dmg` triggers Gatekeeper warnings; real distribution needs an Apple Developer cert. Build unsigned for now.
- **Code signing (Windows):** unsigned `.exe` shows SmartScreen warnings; an EV/OV cert removes them. Deferred.
- **Auto-update** (`electron-updater`): deferred to a fast-follow.

## Out of scope (fast-follow)

Auto-update, code signing, custom icons/branding, deep links, tray icon, native menus beyond the basics, bundling a local Ollama.
