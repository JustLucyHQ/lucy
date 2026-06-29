# CLI

Lucy lives in your terminal too. The `lucy` CLI is a thin client over Lucy's
HTTP API — it authenticates with a Lucy API key and never touches the database,
so it works from any machine that can reach your deployment.

## Setup

1. Create an API key in **Lucy → Settings → API Access** (creating keys stays in
   the browser by design).
2. Configure once:

```bash
npm run lucy -- login        # inside the repo
# or install globally:
npm link                     # then `lucy` works anywhere
lucy login
```

`lucy login` prompts for your server URL and key, saves them to
`~/.lucy/config.json` (`C:\Users\<you>\.lucy\config.json` on Windows), and
verifies with a `whoami` call. Environment variables `LUCY_URL` and
`LUCY_API_KEY` override the file — handy for CI.

> The global `lucy` command runs the live TypeScript via `tsx`, so it always
> reflects the current repo — no rebuild needed.

## The rich terminal

Running `lucy` (no args) or `lucy chat` shows a welcome banner (the LUCY
wordmark, version, and connected server). The chat REPL is built for comfort:

- **Markdown-rendered replies** — bold, italics, inline code, fenced code
  blocks, bullet/numbered lists, blockquotes, and links are formatted in place.
- **Thinking spinner** — a braille spinner runs while the reply generates.
- **Slash-command autocomplete** — type `/` and press **Tab**.
- **Status footer** — each reply ends with `· model · chars · ms`.
- **Boxed output** — `lucy models`, `lucy memories`, and `lucy admin` print in
  rounded boxes.

Colors and formatting only render in an interactive terminal; piping to a file
or another program emits clean, plain text so scripts stay faithful.

## Chat

```bash
lucy chat                              # interactive REPL
lucy chat "summarize our Q2 plan"      # one-shot
lucy chat -m claude-sonnet-4-6 "..."   # pick a model
cat error.log | lucy chat "explain this stack trace"   # pipe stdin in
```

Inside the REPL (commands start with `/` — Tab to autocomplete):

| Command | Action |
|---|---|
| *(plain text)* | send a message |
| `/model <id>` | switch models mid-conversation (`lucy models` lists ids) |
| `/new` | reset the conversation |
| `/exit` | quit |

**Default model:** with no `-m`, the CLI picks a model whose **provider you
actually have a key for** (priority `anthropic → openai → google → …`), instead
of a fixed default — so it won't try a provider you haven't configured. Your
encrypted provider keys and memory are used automatically: the terminal knows
what Lucy knows in the browser.

## Everything else

```bash
lucy models                  # list models you can use (boxed, grouped by provider)
lucy models --local          # also probe Ollama / LM Studio
lucy memories                # what Lucy remembers
lucy memories remember <fact>   # save a personal fact
lucy memories global <fact>     # save shared/global knowledge
lucy memories forget <topic>    # delete matching memories
lucy screenings              # list screenings
lucy screenings get <id>     # one screening (raw JSON)
lucy admin                   # list users + roles (admins only)
lucy admin grant dev@co.com  # promote to admin
lucy admin revoke dev@co.com # demote to member
lucy whoami                  # server, key prefix, admin status
lucy help                    # welcome screen + full command list
```

## Notes

- The CLI streams over the same SSE protocol as the web client and respects the
  same security model — tenant scoping, AES-encrypted provider keys, role-based
  admin gating. `whoami` shows whether your key's account is an admin.
- Memory capture/retrieval follows your deployment's memory settings.
- On self-hosted Supabase, `lucy admin` depends on the auth server exposing
  `listUsers`; if it returns nothing, the CLI says so rather than printing an
  empty list.
- The key in `~/.lucy/config.json` is stored in plaintext (it's your own key on
  your own machine). Rotate it anytime from **Settings → API Access** +
  `lucy login`.
```
