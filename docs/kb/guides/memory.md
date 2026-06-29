# Memory

Memory makes conversations compound: a fact, preference, or decision Lucy picks
up in one chat is recalled in the next. It is **off by default** and you stay in
control — review, add, or wipe anything at any time.

Two stores work together:

- **Profile** — a small, always-on block of stable identity ("who you are":
  name, role, company, communication style). It's injected into every reply.
- **Collection** — a searchable set of individual memories. Only the ones
  relevant to your current message are pulled in.

When a reply draws on the collection, a **"🧠 Lucy used N memories"** note
appears under it.

## Two modes

| | **Connected mode** (signed in, Supabase) | **Standalone** (desktop app) |
|---|---|---|
| Storage | Postgres (`lucy.memories`), RLS-isolated per user | Your browser's IndexedDB |
| Recall | Hybrid: embeddings **+** full-text, fused | Keyword (lexical) only |
| Enable | Admin toggles **Settings → Memory** | You toggle the local switch |
| Embedder | Admin-configured (cloud or local) | Not used |

Everything below applies to both modes except where it says **connected mode
only**.

## Three kinds of memory

Each memory is typed, which changes how fast it fades and how it's labelled when
injected:

| Type | What it holds | Half-life | Injected as |
|---|---|---|---|
| **Semantic** | Stable facts & preferences ("prefers Tailwind") | 60 days | *Facts* |
| **Pragmatic** | Working style / current intent | 10 days | *Working style* |
| **Episodic** | What happened, and when ("Q3 launch moved to October") | 30 days | *Recently* |

Importance decays exponentially toward each half-life, so transient intent ages
out quickly while durable facts persist.

## How recall works (connected mode)

When you send a message, Lucy retrieves the best memories and injects them into
its context. Retrieval is **hybrid**:

1. **Vector search** — your message is embedded and compared against memory
   embeddings by cosine distance (pgvector / `halfvec`, HNSW index).
2. **Full-text search** — the same message runs as a Postgres
   `websearch_to_tsquery` against a generated `tsvector` column.
3. **Reciprocal Rank Fusion** — the two ranked lists are merged with RRF
   (`1 / (k + rank)`, k = 60), so a memory that scores well on *either* signal
   surfaces. This is robust when one signal is weak (e.g. a query that shares no
   words but the same meaning).
4. **Final ranking** — fused candidates are re-scored by
   `relevance × importance × recency`, nudged up slightly each time a memory is
   actually used (reinforcement).

Retrieved memories are "touched" — their access count and last-used timestamp
bump — so frequently-useful memories rank higher over time.

In **standalone mode** there's no embedder or Postgres: recall is keyword
overlap over your local memories, scored by the same importance × recency curve.

### Entity salience

As Lucy extracts memory it also tracks **entities** — client names, products,
people, recurring terms. Each time an entity reappears its occurrence count goes
up, and memories mentioning a high-salience entity get an importance bonus. A
client you talk about constantly naturally outranks a one-off mention.

## How saving works — end-of-conversation reconciliation

After a turn completes, an extraction pass (fire-and-forget, using your chat
model) reads the conversation and proposes durable memories. Crucially, it
doesn't just append — it **reconciles** each candidate against what Lucy already
knows and tags it with an operation:

| Op | Meaning |
|---|---|
| **ADD** | Genuinely new — insert it |
| **UPDATE** | Replaces an existing memory (a fact changed) |
| **MERGE** | Folds into an existing memory |
| **SKIP** | Redundant or trivial — store nothing |

This keeps the collection from filling with near-duplicates. The extractor is
deliberately conservative: it prefers storing **nothing** over noise.

When an UPDATE/MERGE contradicts an existing memory, the **contradiction policy**
(admin setting) decides what happens:

- **Supersede** (default) — overwrite in place; only the current truth is kept.
- **Keep history** — mark the old version invalid and insert the new one,
  preserving an audit trail.

### Privacy guard — secrets never get stored

Every candidate memory and profile value passes a privacy filter **before** it's
written. Anything matching a secret/PII pattern — API keys (`sk-…`, `sk-ant-…`,
Google, GitHub, Slack tokens), PEM private keys, `password:`/`secret:`
assignments, SSNs, credit-card-like digit runs — is dropped. The extractor
prompt is *also* told never to emit secrets, so this is defence in depth.

## Commands

Type `/` in the chat input for autocomplete. Saving requires memory to be on
(and not incognito).

| Command | Effect |
|---|---|
| `/remember <fact>` | Save a fact immediately (high priority) |
| `/global <fact>` | Save shared knowledge visible to everyone in the deployment |
| `/forget <text>` | Forget memories whose content matches the text |
| `/memories` | Show how many memories Lucy holds, plus a few recent ones |
| `/incognito` | Toggle "no capture" for this session |

`/remember` and `/global` are explicit saves and carry more weight than
auto-extracted memories, so they rank higher in recall. `/incognito` is a
per-session switch — while it's on, Lucy **neither recalls nor captures**
memory: the retrieval block is skipped for the turn and the end-of-turn
extraction is skipped entirely.

```
You:  /remember the staging DB is on port 6543
Lucy: 🧠 Saved to memory.

You:  /global I prefer concise answers with code first
Lucy: 🧠 Saved to memory (shared globally).

You:  /forget staging DB
Lucy: 🗑️ Forgot 1 memory matching "staging DB".
```

## Visibility

| Visibility | Who sees it |
|---|---|
| **Private** (default) | Only you |
| **Global** (`/global`) | Everyone in the deployment (shared knowledge) |

Memories are isolated per user by row-level security in connected mode, and per
browser in standalone mode. Forgetting with `/forget` archives matching memories
immediately.

## Your controls — Settings → Memory

The user-facing panel lets you:

- **Turn memory on or off** (in connected mode this reflects the admin gate;
  in standalone mode it's your own local switch).
- **Toggle incognito** for the current session.
- See **storage usage** — memory count, entity count, and size.

To review or prune what Lucy holds, use the chat commands: `/memories` lists a
recent sample, and `/forget <text>` archives anything matching.

## Admin settings (connected mode only)

Deployment-wide memory settings live in the admin panel and require the admin
role to change. They write a single config row (`lucy.memory_settings`):

| Setting | What it does |
|---|---|
| **Enabled** | Master switch for memory across the deployment |
| **Contradiction policy** | `supersede` (keep current truth) vs `keep_history` (audit trail) |
| **Deletion grace window** | Days an archived memory is retained before it's purged for good |
| **Embedder** | Which model turns text into vectors (see below) |

### The pluggable embedder

The embedder is what makes recall work by *meaning* instead of keywords. It's
swappable, with presets that fill provider, model, base URL, and dimensions
together:

- **OpenAI** `text-embedding-3-small` (1536) — the default — or `3-large`
  (3072).
- **Local Ollama** (e.g. `embeddinggemma`, `nomic-embed-text`,
  `mxbai-embed-large`, `bge-m3`) at `http://localhost:11434/v1` — **no API key,
  no cloud calls**, a fully local setup.
- Other OpenAI-compatible providers (Google, Mistral, Jina, Voyage) work by base
  URL alone; **Cohere** is supported through its own adapter.

The embedder API key is **server-only** — it's never returned to the browser,
only whether one is set.

**Dimension auto-reshape.** Different models output different vector sizes.
Changing the dimension reshapes the `embedding` column to match and **clears
existing embeddings** (they're invalid at the new dimension) — they regenerate
on next use. Memories themselves are untouched; only their vectors are rebuilt.

### Graceful degradation — the lexical fallback

If no embedder is configured, or the embedding provider errors, memory **does
not break**. Vector search simply returns nothing for that query and recall
falls back to Postgres full-text search alone. New memories are still stored
(just without a vector until an embedder is available). This is the same lexical
engine that standalone mode uses by default.

## Related

- [Chat & models](/docs/chat) — slash commands and the model you chat with
- [Workflows](/docs/workflows) — the **Knowledge Base** node recalls your
  memories inside a pipeline
