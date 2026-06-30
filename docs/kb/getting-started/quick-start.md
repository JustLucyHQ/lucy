# Quick start

## Run locally (5 minutes)

```bash
git clone https://github.com/JustLucyHQ/lucy.git
cd LucyAI
npm install
npm run dev
```

Open `http://localhost:3001`. Lucy starts in **standalone mode** — no database, no signup, everything stored in your browser.

## Add an API key

Open **Settings → Providers** and paste a key for at least one provider (OpenAI, Anthropic, Google, Groq, Mistral, DeepSeek, xAI, or OpenRouter). Keys are kept client-side in standalone mode and encrypted server-side (AES-256-GCM) in connected mode.

No key at all? Install [Ollama](https://ollama.com), pull a model (`ollama pull llama3`), and Lucy discovers it automatically — the Local group appears in the model selector.

## First chat

1. Go to **Chat**, pick a model from the selector in the input bar.
2. Type a message. Replies stream in real time.
3. Switch the model mid-conversation whenever you like — the history goes with you.

Try a slash command: type `/` in the input to see `/remember`, `/memories`, `/incognito`, `/new`, and friends.

## Docker

```bash
docker-compose up --build
```

The compose file maps `OLLAMA_URL` to `host.docker.internal` so the container can reach Ollama on your host machine.

## Going connected (Supabase)

Set two environment variables in `.env.local` and restart:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # for memory, screening, connectors
```

Then apply the schema files — see [Self-hosting](/docs/self-hosting) for the full walkthrough. Connected mode unlocks login (email + Google), per-user data isolation, persistent memory with vector search, the connector marketplace, and the admin panel.

## Other ways to use Lucy

- **Desktop app** — a local-first build for [Windows, macOS, or Linux](/download); no account needed, your data stays on your machine. See [Desktop app](/docs/desktop).
- **Terminal** — the `lucy` CLI brings streaming chat, memory, and admin to any shell, with the same encrypted keys and memory as the web app. Pipe logs into it (`cat error.log | lucy chat "explain this"`) or script it. See [CLI](/docs/cli).
- **Embed** — drop Lucy into any web app with one script tag. See [Embedding Lucy](/docs/embedding).
