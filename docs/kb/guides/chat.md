# Chat & models

## Choosing a model

The model selector lives in the chat input bar. Cloud providers are always listed; the **Local** group appears when Lucy detects a running Ollama (`localhost:11434`) or LM Studio (`localhost:1234`) server. Use the refresh button next to the selector to re-probe.

You can switch models **mid-conversation** — the full history goes to the new model, so you can draft with a fast model and polish with a stronger one, or compare answers side by side.

## Providers & models

Lucy reaches every major provider through one interface. Add your own key in **Settings → Providers** (kept client-side in standalone mode, AES-256-GCM encrypted server-side in connected mode) — or run fully local with no key at all.

| Provider | Models |
|---|---|
| **OpenAI** | GPT-4o · GPT-4o Mini · GPT-3.5 Turbo |
| **Anthropic (Claude)** | Claude Opus 4.8 · Claude Sonnet 4.6 · Claude Haiku 4.5 |
| **Google (Gemini)** | Gemini 2.0 Flash · Gemini 1.5 Pro |
| **DeepSeek** | DeepSeek V3 (Chat) · DeepSeek R1 (Reasoner) |
| **Groq** | Llama 3.3 70B · Llama 3.1 8B Instant · Gemma 2 9B — ultra-fast LPU inference |
| **Mistral** | Mistral Large · Mistral Small |
| **xAI** | Grok 2 · Grok Beta |
| **OpenRouter** | Auto-route, plus 200+ models behind one key (e.g. Claude 3.5 Sonnet, Llama 3.3 70B) |
| **Local** | Any [Ollama](https://ollama.com) or [LM Studio](https://lmstudio.ai) model you've pulled — auto-discovered, no API key |

Server-level keys (set as env vars) act as a shared fallback when a user hasn't entered their own. Local models appear automatically once their server is running; the cloud catalog is defined in `lib/providers/<provider>.ts`.

## Message tools

- **Edit** (pencil icon on your messages): rewrites the message and re-sends from that point. Cmd/Ctrl+Enter saves, Escape cancels.
- **Regenerate** (on Lucy's replies): re-runs the preceding prompt.
- **Copy** any message; code blocks have their own copy button with language labels and line numbers.
- **Read aloud** (speaker icon): speaks the reply using your configured voice.
- **Token counts** appear per message on hover and as a conversation total in the header.
- **Export** a conversation as Markdown or JSON from the ⋯ menu.

## Slash commands

Type `/` in the input for autocomplete:

| Command | Effect |
|---|---|
| `/remember <fact>` | Save a fact to Lucy's memory |
| `/global <fact>` | Save a fact visible across all projects |
| `/forget <topic>` | Remove matching memories |
| `/memories` | List what Lucy knows |
| `/incognito` | Toggle no-capture mode for this conversation |
| `/new` | Start a fresh conversation |
| `/help` | Show all commands |

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Cmd/Ctrl + K` | Focus conversation search |
| `Cmd/Ctrl + Shift + N` | New chat |
| `Escape` | Close mobile sidebar |

## Tool use

If you have [connectors](/docs/connectors) installed, Lucy can call their tools mid-reply. Tool calls appear as colored chips above the streaming message — gray while running, green on success, red on failure.
