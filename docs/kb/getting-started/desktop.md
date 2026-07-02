# Desktop app

Lucy ships as a downloadable desktop app that runs the **full Lucy server on your own machine** — local-first, offline-capable, and private by default. It's the same Lucy as the web app, just bundled so anyone can install and run it without Node.js.

## Download

Get the installer for your platform from the [download page](/download), which auto-detects your OS:

- **Windows** — `.exe` (NSIS installer), Windows 10 / 11, 64-bit
- **macOS** — `.dmg`, macOS 12 Monterey or later (Apple Silicon & Intel)
- **Linux** — `.AppImage`, runs on most distributions

> macOS and Linux builds aren't notarized yet — allow the app in Gatekeeper, or mark the AppImage executable, to run it.

## Local-first by default

A fresh desktop install runs in **standalone mode**: no account, no Supabase. Your chats, memory, and provider keys live on your machine (localStorage / IndexedDB). Nothing leaves your computer except the calls to whichever AI provider you choose — and with a local model ([Ollama](https://ollama.com) or [LM Studio](https://lmstudio.ai)), not even that. The desktop build also ships with **no analytics**.

## First run

On first launch the desktop app goes **straight to the setup wizard** — it never shows the marketing/landing page (in standalone mode the app redirects the root to onboarding). The wizard:

1. **Welcome** — optional name / workspace.
2. **Power Lucy** — paste a cloud API key (OpenAI, Claude, Gemini, …) **or** point at a local Ollama / LM Studio model. Keys are stored locally in your browser storage, never sent to our servers.
3. **Test chat** — open the chat and send your first message.

Subsequent launches skip the wizard and go straight to chat (a one-time `lucy.onboarded` flag).

## Cloud / live version

The desktop app is **standalone-only for now** — there is **no in-app account sign-in or API-key login** that points the desktop at the live cloud backend. What exists today:

- **One-way push sync** (optional): if you also use Lucy on the web (a justlucy.ai or self-hosted account), push your local chats and settings *up* from **Settings → General → Cloud**. The sync is **one-way and idempotent** — re-syncing updates records in place rather than duplicating them. Provider-key sync is an opt-in checkbox (off by default).
- **Use Lucy on the web**: the onboarding's finish step links out to [justlucy.ai](https://justlucy.ai) (opens in your browser) for the full account-backed web app.

> **Not yet (under consideration):** signing in to your Lucy account *inside* the desktop app, or pasting a Lucy API key to use the live cloud backend (memory / sync) from the desktop. If we add it, the leaning is a **hybrid build** — ship the (public) Supabase config in the desktop and make storage mode runtime-switchable: local by default, connected once you sign in. **Deferred** — the desktop stays purely local for now.

## Build the installers yourself

From the repo:

```bash
npm run dist        # builds the standalone server + produces installers in dist-desktop/
```

`dist` produces an NSIS `.exe` (Windows), a `.dmg` (macOS), and an `.AppImage` (Linux) via electron-builder. Build on — or cross-build for — each target OS. The desktop build clears the cloud / analytics env so the packaged app stays local-first. For running Lucy as a shared server instead, see [Self-hosting](/docs/self-hosting).
