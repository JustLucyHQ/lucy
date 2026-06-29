# Introduction

Lucy is an open-source AI platform for teams: **a closed environment, with a brain.**

Most AI platforms are someone else's cloud. Lucy is a sealed room inside your company — the models come to you. You chat with OpenAI, Claude, Gemini, or local models like Ollama through one clean interface, and everything Lucy learns stays in **your** database, on **your** deployment, under **your** keys.

## The three pillars

**The brain.** Lucy remembers. Decisions, preferences, and project context are extracted from conversations automatically and recalled when they matter. Memory is stored in your own database (or your browser in standalone mode), is visible in Settings → Memory, and is deletable on command.

**The walls.** Self-hosted, your API keys, per-user row-level security. Switch to a local model and sensitive data never leaves the building. No telemetry, no training on your chats, no third party in the room.

**The doors.** One script tag embeds Lucy in any app you own. Shared auth across your stack, a screening API for your backends, and MCP connectors in both directions. The environment is closed — you hold the keys to every door.

## What's inside

| Capability | What it does |
|---|---|
| Multi-provider chat | 10 providers, 25+ models, switch mid-conversation |
| Memory | Cross-conversation semantic memory with `/remember`, `/forget`, `/memories` |
| Connectors | MCP marketplace — GitHub, Slack, Notion, Postgres and more, one-click install |
| Workflows | Visual drag-and-drop AI pipelines |
| Personas | Built-in and custom system-prompt personas |
| Voice | Speech-to-text input and read-aloud replies |
| Themes | Five interface themes, from Luminous to corporate Light |
| Embedding | One-line widget for any web app |
| Local models | Ollama and LM Studio, auto-discovered |
| Terminal | The `lucy` CLI — chat, memory, and admin from any shell, with the same keys and memory as the web app |
| Desktop app | Downloadable, local-first app for Windows, macOS, and Linux |

## Two deployment modes

- **Standalone** — zero configuration. Everything lives in your browser's localStorage. Great for evaluation and personal use.
- **Connected** — add a Supabase project and you get authentication, multi-user isolation (RLS), cross-device sync, persistent memory with vector search, and the connector marketplace.

Lucy runs in the **browser**, as a downloadable **desktop app**, from your **terminal** (the `lucy` CLI), embedded in your own apps via a **script tag**, and as a **Telegram** bot — all backed by the same memory and keys.

Next: [Quick start](/docs/quick-start)
