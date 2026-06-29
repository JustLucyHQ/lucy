# Connectors

Connectors give Lucy hands. Through the [Model Context Protocol](https://modelcontextprotocol.io) (MCP) — an open standard — Lucy can read your repos, query a database, search the web, or post to Slack live, mid-conversation. You browse a curated catalog, install a connector with one click, and Lucy treats its tools as her own.

> Connectors are a **connected-mode** feature. They require Supabase and a signed-in user. Each user installs and configures their own connectors; secrets and installs are scoped per account and never leak between users. The desktop app (standalone, no account) doesn't run connectors.

## The marketplace

Open **Connectors** in the sidebar. Two tabs:

- **Browse** — the catalog. Filter by category (Dev, Productivity, Messaging, Data, Payments, Search, Local) or type in the search box (matches name and description). Verified connectors show a ✓.
- **Installed** — your connectors, with per-connector controls (below).

Each card shows the connector's icon, category, description, and tool count. Click one to open its detail panel, where you see the full tool list and the config form.

### The catalog

A curated set ships in the catalog. The most common:

| Connector | Category | What Lucy can do | You provide |
|---|---|---|---|
| **GitHub** | Dev | Search repos, read files, create issues | Personal access token (`repo` scope) |
| **Slack** | Messaging | List channels, post messages | Bot token (`xoxb-`) + team ID |
| **Notion** | Productivity | Search pages, query databases | Integration token |
| **Postgres** | Data | Run read-only SQL | Connection string |
| **Linear** | Productivity | List & create issues | API key |
| **Stripe** | Payments | List customers, create payment links | Secret key (use a [restricted key](https://docs.stripe.com/keys#limit-access)) |
| **Brave Search** | Search | Web & local search | Brave API key |
| **Filesystem** | Local | Read/write files in one allowed directory | Absolute path |
| **Fetch** | Search | Fetch a URL as markdown | — (no config) |

The catalog also includes GitLab, Sentry, Supabase, Redis, MongoDB, Airtable, Google Maps, Exa, Firecrawl, Tavily, Puppeteer, Discord, and reasoning helpers (Sequential Thinking, Memory graph). Browse the full list in the app. Most connectors run as a local subprocess via `npx`; a few are remote (HTTP). The catalog itself is public and read-only — only Lucy's service role seeds or edits it.

## Installing

1. Open a connector card → **detail panel**.
2. Fill in the config fields (tokens, URLs, paths) and click **Install**.
3. The connector appears under **Installed**, ready for Lucy to use in chat.

Required fields are validated server-side before the install is saved. Connectors with no config (like Fetch) install with a single click. Built-in connectors are always active and need no setup.

### How your secrets are handled

This is the part worth trusting. Secret fields (tokens, connection strings) are:

- **Encrypted at rest with AES-256-GCM** before they ever touch the database. Encryption happens server-side; the key is derived from the server's service-role key, so ciphertext in the `config` column is useless on its own.
- **Never returned to the browser.** When the app loads your installs, secret values come back as a `__set__` marker, not the value. A saved secret shows as `••• set — leave blank to keep`. Text fields (URLs, team IDs, paths) are not secret and round-trip normally.
- **Re-save safe.** Leaving a secret field blank on a re-save keeps the existing encrypted value — a blank box never wipes or overwrites a stored secret. Submitting a new value re-encrypts and replaces it.

Secrets are decrypted only on the server, only at the moment Lucy actually calls a tool. They never reach your browser, the model, or another user.

## Using tools in chat

Once a connector is **enabled**, Lucy decides on her own when to call its tools — you don't invoke them manually. Ask a question and she reaches for whatever fits:

```
You:  What are the open PRs on our main repo, and is anything failing CI?
Lucy: [github__search_repositories ●] [github__get_file_contents ●]
      You have 3 open PRs. #214 is red — the test job failed on …
```

Tool calls surface as **live status chips above the streaming reply**:

- **Gray** while the tool is running.
- **Green** when it succeeds.
- **Red** on failure.

Each chip names the connector and the tool. Tool *arguments* are intentionally **not** sent to the browser — only the connector slug, tool name, and outcome — so model-generated payloads stay server-side. Tools are namespaced as `slug__tool` (e.g. `github__create_issue`) so two connectors can expose a same-named tool without colliding.

Lucy runs an agentic loop: she can call several tools, read the results, and call more before writing her answer (capped per reply). Disabled connectors are invisible to her.

### Which models support tool use

Tool use only fires on tool-capable providers. If your current model isn't one of these, connectors stay installed but idle for that reply:

| Family | Providers |
|---|---|
| **OpenAI-compatible** | OpenAI · DeepSeek · Groq · Mistral · xAI · OpenRouter |
| **Anthropic** | Claude |

See [Chat & models](/docs/chat) for switching models mid-conversation.

## Approval gating

By default Lucy executes any tool a connector exposes. Flip **Approve writes** on an installation (in the **Installed** tab) to gate the dangerous ones.

With it on, **write-like actions are blocked before they run** — Lucy gets back an "approval required" result and explains that the action needs your sign-off instead of performing it silently. Read operations keep flowing untouched, so a gated connector is still useful for lookups.

"Write-like" is matched on the tool name. An action is gated when its name starts with one of:

```
create · update · delete · send · write · post · put · patch · remove · merge
```

So `create_issue`, `send_message`, and `delete_record` need approval; `search_repositories`, `list_channels`, and `query` don't. The gate is enforced server-side per installation — toggling it can't be bypassed by the model.

## Managing installs

The **Installed** tab gives each connector:

| Control | Effect |
|---|---|
| **Enabled** toggle | Off = Lucy can't see or call its tools, but the config is kept |
| **Approve writes** toggle | Gates write-like tools behind your approval (see above) |
| **Configure** | Reopen the detail panel to update tokens or settings |
| **Uninstall** | Deletes the install **and its encrypted secrets** |

Disabling is reversible and cheap; uninstalling is permanent. Both are scoped to your account only.

## Related

- [Chat & models](/docs/chat) — model selector, tool-use chips, slash commands
- [Workflows](/docs/workflows) — chain tools and models into a durable pipeline
- [Lucy as an MCP server](/docs/mcp-server) — expose Lucy's own tools to Claude Code and other MCP clients
