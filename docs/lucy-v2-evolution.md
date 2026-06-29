# Lucy v2 — Evolution Roadmap

> Design doc for Lucy's next phase. Not a wish list — a practical plan to make Lucy the best open-source AI platform for teams.

**Date:** 2026-06-08
**Status:** Draft — brainstorming phase

---

## Vision

Lucy today: multi-provider AI chat + visual workflows + embeddable widget + dual storage.

Lucy tomorrow: **the AI bridge** — connects any AI to any app, remembers everything, and works everywhere your team works.

Three pillars:

1. **Memory** — Lucy remembers across conversations, learns your preferences, gets smarter over time
2. **MCP Marketplace** — one-click install of tools that connect Lucy to any service (GitHub, Slack, Jira, databases, APIs)
3. **Bridge** — Lucy as the connective tissue between your apps, your AI agents, and your team's knowledge

---

## Research Summary

### Projects Studied

| Project | Stars | Key Takeaway for Lucy |
|---|---|---|
| **Mem0** | 51K+ | Gold standard memory architecture: vector + graph + key-value, three scopes (user/session/agent) |
| **Captain Claw** | 49 | Your friend Stevica's project. 5-layer memory (working/semantic/deep/insights/nervous system), dreaming cycles, cognitive modes. MIT license. Most sophisticated cognitive architecture we found |
| **AionUI** | 28K | Apache-2.0 base that Wayland forked. Multi-channel (Telegram/Lark/DingTalk), extension SDK, team orchestration |
| **Wayland** | 237 | AionUI fork with cognitive memory added. AGPL — can study architecture but can't copy code |
| **LobeChat** | 55K+ | Best MCP marketplace implementation with ratings and one-click install |
| **Mastra** | 22K+ | TypeScript-native agent framework designed for Next.js. Agent + workflow + RAG + memory. Most directly relevant to Lucy's stack |
| **Dify** | 138K | Visual workflow builder + RAG + plugin marketplace with 100+ plugins |
| **OpenWebUI** | 128K | Per-user memory indexing, community marketplace with 355K+ members |
| **CrewAI** | 53K | Multi-agent orchestration with role-based agents and unified memory sharing |
| **Letta (MemGPT)** | 15K | Pioneer of self-editing memory — agents manage what they remember/forget |
| **n8n** | 75K | Best integration bridge: 400+ native integrations, bidirectional MCP (consume AND expose) |
| **LibreChat** | 34K | Deferred MCP tool loading — only load schemas on demand to save context window |
| **Cognee** | 12K | Self-contained memory stack: SQLite + LanceDB (vector) + Kuzu (graph). No cloud needed |
| **CopilotKit/AG-UI** | 30K | AG-UI protocol for streaming agent state to React frontends |
| **Vercel AI SDK 6** | — | Native MCP, agent memory, streaming, Next.js-first |

### Captain Claw Deep Dive (kstevica)

Stevica's project is genuinely impressive for a solo developer — 520 commits, 46 built-in tools, MIT licensed. The memory system is the most sophisticated we found in any open-source project:

**5-Layer Memory Architecture:**
```
┌──────────────────────────────────────────────────────┐
│ Layer 1: Working Memory                               │
│ In-context conversation, 100K token budget            │
│ Auto-compacts at 80% by summarizing older messages    │
├──────────────────────────────────────────────────────┤
│ Layer 2: Semantic Memory                              │
│ Hybrid BM25 + vector search over documents/sessions   │
│ L1/L2/L3 text representations (summary/detail/full)   │
│ 21-day temporal decay half-life                       │
│ SQLite + scikit-learn embeddings                      │
├──────────────────────────────────────────────────────┤
│ Layer 3: Deep Memory                                  │
│ Typesense-backed archive for millions of documents    │
│ Long-term knowledge that survives everything          │
├──────────────────────────────────────────────────────┤
│ Layer 4: Insights                                     │
│ Auto-extracted facts, contacts, decisions, deadlines  │
│ SQLite FTS5 for full-text search                      │
│ Deduplication + categorization                        │
├──────────────────────────────────────────────────────┤
│ Layer 5: Nervous System                               │
│ Autonomous pattern recognition — "dreaming"           │
│ Finds connections across ALL memory layers            │
│ Intuition types: connection, pattern, hypothesis,     │
│   association, unresolved                             │
│ Confidence decay over time                            │
│ Surfaces insights proactively                         │
└──────────────────────────────────────────────────────┘
```

**What Lucy should take from Captain Claw:**
- The semantic memory architecture (hybrid BM25 + vector with temporal decay)
- The insights extraction pattern (auto-extract facts from conversations)
- The L1/L2/L3 text representation (efficient context window usage)
- Can potentially integrate via MCP (Captain Claw has both MCP server + client)

---

## Phase 1: Memory System

**Priority: HIGHEST. This is what makes Lucy "smart."**

### Architecture

Lucy's memory should be simpler than Captain Claw's 5 layers but more than just chat history. Three layers, all in Supabase (standalone mode uses localStorage fallback):

```
┌───────────────────────────────────────────────────┐
│              Lucy Memory System                    │
├───────────────────────────────────────────────────┤
│                                                    │
│  Layer 1: Conversation Memory (exists today)       │
│  ├── Chat messages stored in lucy.messages         │
│  ├── Per-conversation, per-user                    │
│  └── No cross-conversation awareness              │
│                                                    │
│  Layer 2: Semantic Memory (NEW)                    │
│  ├── lucy.memories table                           │
│  │   ├── id, user_id, content, category            │
│  │   ├── embedding (pgvector)                      │
│  │   ├── importance (1-10)                         │
│  │   ├── access_count, last_accessed               │
│  │   └── created_at, updated_at, expires_at        │
│  ├── Categories: fact, preference, decision,       │
│  │   pattern, contact, project_context             │
│  ├── Auto-extracted after each conversation        │
│  ├── Semantic search via pgvector similarity       │
│  └── Temporal decay (less important = fade out)    │
│                                                    │
│  Layer 3: Knowledge Base (FUTURE)                  │
│  ├── lucy.knowledge table                          │
│  ├── Document chunks with embeddings               │
│  ├── Upload PDFs, docs, URLs                       │
│  └── RAG retrieval during chat                     │
│                                                    │
├───────────────────────────────────────────────────┤
│  Memory Pipeline:                                  │
│                                                    │
│  Conversation ends                                 │
│    → Extract key facts (LLM call)                  │
│    → Deduplicate against existing memories         │
│    → Store with embedding + importance score        │
│    → Before next conversation:                     │
│        → Query relevant memories                   │
│        → Inject into system prompt                 │
│        → Lucy responds with context awareness      │
└───────────────────────────────────────────────────┘
```

### Implementation Plan

**New files:**
```
lib/memory/
  ├── types.ts          # Memory, MemoryCategory, MemoryQuery interfaces
  ├── extractor.ts      # LLM-powered fact extraction from conversations
  ├── store.ts          # MemoryStore: CRUD + semantic search
  ├── embeddings.ts     # Generate embeddings (OpenAI/local)
  ├── injector.ts       # Build memory context for system prompts
  └── decay.ts          # Temporal decay + importance scoring
```

**Database (Supabase):**
```sql
-- In lucy schema
CREATE TABLE memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL, -- fact, preference, decision, pattern, contact, project_context
  importance INTEGER DEFAULT 5 CHECK (importance BETWEEN 1 AND 10),
  embedding vector(1536), -- pgvector
  source_conversation_id UUID REFERENCES conversations(id),
  access_count INTEGER DEFAULT 0,
  last_accessed TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ -- null = never expires
);

-- Knowledge base chunks (per-user RAG)
CREATE TABLE knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  source_name TEXT NOT NULL,
  source_type TEXT DEFAULT 'document', -- document, url, manual
  chunk_text TEXT NOT NULL,
  chunk_index INTEGER DEFAULT 0,
  embedding vector(1536),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Similarity search indexes
CREATE INDEX memories_embedding_idx ON memories
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX knowledge_embedding_idx ON knowledge_chunks
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- RLS
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;
CREATE POLICY memories_user ON memories FOR ALL USING (auth.uid() = user_id);
ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY knowledge_user ON knowledge_chunks FOR ALL USING (auth.uid() = user_id);
```

**Standalone mode fallback:** Use `localStorage` with simple keyword matching instead of vector search. Not as good, but works without infrastructure.

### How It Works

1. User has a conversation about setting up a React project with Tailwind
2. Conversation ends → Lucy's extractor runs:
   - "User prefers Tailwind CSS over styled-components" → category: `preference`
   - "User's company uses Next.js 14" → category: `fact`
   - "User decided to use Zustand for state management" → category: `decision`
3. Next conversation, user asks "help me set up a new project":
   - Memory injector queries: `preference` + `fact` + `decision` memories
   - System prompt includes: "You know this user prefers Tailwind, uses Next.js 14, and chose Zustand..."
   - Lucy responds with personalized recommendations

---

## Phase 2: MCP Marketplace

**Priority: HIGH. This is what makes Lucy extensible.**

### What It Is

A curated registry of MCP servers that Lucy can connect to. Users browse, one-click install, and Lucy gains new capabilities (search GitHub, query databases, send Slack messages, etc.).

### Architecture

```
┌───────────────────────────────────────────────────┐
│              Lucy MCP Marketplace                  │
├───────────────────────────────────────────────────┤
│                                                    │
│  Registry (lucy.mcp_servers table)                 │
│  ├── id, name, description, author                 │
│  ├── transport: stdio | http | sse                 │
│  ├── install_command (npm/pip package)              │
│  ├── config_schema (JSON Schema for settings)      │
│  ├── tools[] — list of exposed tool names           │
│  ├── category: search, database, messaging,        │
│  │   dev-tools, productivity, analytics            │
│  ├── rating, install_count                         │
│  └── verified: boolean                             │
│                                                    │
│  User Installations (lucy.mcp_installations)       │
│  ├── user_id, mcp_server_id                        │
│  ├── config (user's settings for this server)      │
│  ├── enabled: boolean                              │
│  └── installed_at                                  │
│                                                    │
│  Runtime (MCP Client in Lucy's API routes)         │
│  ├── Connect to installed MCP servers              │
│  ├── Deferred tool loading (LibreChat pattern)     │
│  │   — only load tool schemas when needed          │
│  ├── Tool calls routed through MCP protocol        │
│  └── Results injected into conversation            │
│                                                    │
├───────────────────────────────────────────────────┤
│  Starter Pack (built-in, no install needed):       │
│  ├── filesystem — read/write local files           │
│  ├── brave-search — web search                     │
│  ├── postgres — query databases                    │
│  ├── github — repos, issues, PRs                   │
│  └── fetch — HTTP requests                         │
└───────────────────────────────────────────────────┘
```

### New files:
```
lib/mcp/
  ├── client.ts         # MCP client — connect to servers, call tools
  ├── registry.ts       # Browse/search available servers
  ├── installer.ts      # Install/uninstall/configure servers
  └── loader.ts         # Deferred tool loading (lazy schema fetch)

app/marketplace/
  └── page.tsx          # Marketplace UI — browse, install, configure

app/api/mcp/
  ├── registry/route.ts # GET — list available servers
  ├── install/route.ts  # POST — install a server for current user
  └── tools/route.ts    # POST — call a tool on an installed server
```

### Key Design Decisions

1. **Deferred loading** (from LibreChat): Don't load all tool schemas upfront. Only fetch when the user's prompt might need them. This keeps the context window clean.
2. **Per-user installations**: Each user installs and configures their own MCP servers. One user's GitHub token doesn't leak to another.
3. **Seed from official registry**: Pull from `registry.modelcontextprotocol.io` as the source of truth, but allow custom/private servers too.

---

## Phase 3: Bridge / Integration Hub

**Priority: HIGH. This is Lucy's unique differentiator.**

Lucy already has the `registerProject()` pattern. Evolve it into a proper integration hub where Lucy is the bridge between:

- Your apps (Contractors Room, future projects)
- External services (via MCP)
- AI agents (Captain Claw, future lucyio agent)
- Communication channels (Telegram, WhatsApp)

### Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    Lucy Bridge                            │
│                                                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │
│  │ Your Apps    │  │ MCP Servers │  │ AI Agents   │      │
│  │             │  │             │  │             │      │
│  │ Contractors │  │ GitHub      │  │ Captain     │      │
│  │ Room        │  │ Slack       │  │ Claw        │      │
│  │ Future App  │  │ Jira        │  │ lucyio      │      │
│  │ Any Supabase│  │ Postgres    │  │ Custom      │      │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘      │
│         │                │                │              │
│         ▼                ▼                ▼              │
│  ┌────────────────────────────────────────────────┐      │
│  │            Unified Context Engine               │      │
│  │                                                 │      │
│  │  Project data + MCP tools + Agent capabilities  │      │
│  │  → merged into AI system prompt                 │      │
│  │  → Lucy responds with full awareness            │      │
│  └────────────────────────────────────────────────┘      │
│         │                                                 │
│         ▼                                                 │
│  ┌────────────────────────────────────────────────┐      │
│  │              Channels (output)                  │      │
│  │  Web UI | Telegram Bot | WhatsApp | Embed       │      │
│  └────────────────────────────────────────────────┘      │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

### Captain Claw Integration

Since Captain Claw exposes an OpenAI-compatible API proxy AND an MCP server, Lucy can integrate both ways:

1. **As an AI provider**: Register Captain Claw as a "local" provider in Lucy. Users chat with Captain Claw's agents through Lucy's UI, getting all 46 tools + cognitive features.
2. **As an MCP server**: Add Captain Claw to Lucy's MCP marketplace. Lucy's AI can call Captain Claw's tools (search, file ops, browser automation) during conversations.

### lucyio Agent

LucyIO is a separate agent identity that lives inside Lucy. While Lucy is the platform, LucyIO is the AI that can act autonomously:

```
┌────────────────────────────────────────────┐
│              LucyIO Agent                  │
├────────────────────────────────────────────┤
│                                             │
│  Capabilities                               │
│  ├── Use MCP tools autonomously             │
│  ├── Schedule and run tasks (cron)          │
│  ├── Query knowledge base for answers       │
│  ├── Access semantic memory                 │
│  ├── Execute workflow pipelines             │
│  ├── Hand off to specialized sub-agents     │
│  └── Respond across any channel             │
│                                             │
│  Personality                                │
│  ├── Configurable system prompt             │
│  ├── Company-specific knowledge             │
│  ├── Learns from interactions (memory)      │
│  └── Different from personas (LucyIO is     │
│      the platform agent, personas are       │
│      conversation-level modes)              │
│                                             │
│  Multi-Agent (future)                       │
│  ├── LucyIO as coordinator                  │
│  ├── Specialist agents (code, data, sales)  │
│  ├── Handoff pattern (OpenAI Swarm style)   │
│  └── Shared memory between agents           │
│                                             │
└────────────────────────────────────────────┘
```

LucyIO connects to Lucy via the Bridge — it's an enhancement, not a core dependency. Lucy works fine without it.

---

## Phase 4: Scheduled Tasks

**Priority: MEDIUM-HIGH. Makes Lucy proactive, not just reactive.**

Borrowed from AionUI's cron system and Captain Claw's scheduler:

```
lib/scheduler/
  ├── types.ts     # ScheduledTask, CronExpression, ExecutionMode
  ├── engine.ts    # Task runner (cron + interval + one-time)
  └── store.ts     # Zustand store for task management

app/tasks/
  └── page.tsx     # Task management UI (list, create, edit, history)
```

**Database:**
```sql
CREATE TABLE lucy.scheduled_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  schedule TEXT NOT NULL,           -- cron expression or interval
  prompt TEXT NOT NULL,             -- what to ask Lucy
  persona_id TEXT,
  model TEXT DEFAULT 'gpt-4o',
  execution_mode TEXT DEFAULT 'fresh', -- 'fresh' | 'continue'
  conversation_id UUID,            -- if continue mode
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**Example:** "Every Monday 9am, summarize last week's project activity from Contractors Room and send it to my Telegram."

---

## Phase 5: Multi-Channel

**Priority: MEDIUM. Extends Lucy's reach.**

### Telegram Bot

The simplest channel to add. Users chat with Lucy from Telegram.

```
lib/channels/
  ├── types.ts          # UnifiedMessage interface
  ├── telegram.ts       # grammY SDK bot
  └── webhook.ts        # Webhook handler for incoming messages

app/api/channels/
  └── telegram/route.ts # Webhook endpoint
```

**Flow:**
1. User sends message to @LucyAIBot on Telegram
2. Telegram sends webhook to Lucy's API
3. Lucy processes message (with memory + MCP tools)
4. Lucy responds via Telegram API
5. Conversation stored in lucy.messages (linked to Telegram user)

### WhatsApp (later)

Via WhatsApp Cloud API or Twilio. Same pattern as Telegram but with WhatsApp-specific auth flow.

---

## Phase 5: UX / Design Improvements

**Priority: MEDIUM. Polish what exists.**

### Current Issues
- Chat UI works but could feel more modern
- Settings page is functional but dense
- Workflow builder needs more polish
- No dark/light mode preview in settings

### Ideas
- **Command palette** (Cmd+K) — search conversations, switch models, access tools
- **Split view** — chat + document/code side by side
- **Rich message cards** — structured responses (tables, charts, code diffs) not just markdown
- **Activity feed** — see what Lucy's doing (memory extraction, MCP calls, scheduled tasks)
- **Onboarding improvements** — interactive tour, not just a wizard

### lucyio Design Agent

A future AI agent that can:
- Analyze Lucy's current UI
- Suggest improvements based on best practices
- Generate Tailwind component code
- A/B test layouts

---

## Implementation Priority

| Phase | What | Effort | Impact | When |
|---|---|---|---|---|
| **1** | Memory System (semantic + extraction) | 2-3 weeks | Massive — makes Lucy "smart" | First |
| **2** | MCP Marketplace (registry + client) | 2 weeks | High — makes Lucy extensible | Second |
| **3a** | Bridge improvements (better integration registry) | 1 week | High — Lucy's differentiator | Third |
| **3b** | Captain Claw integration (MCP + API provider) | 3-4 days | Medium — leverages Stevica's work | Third |
| **4** | Telegram bot | 3-4 days | Medium — reaches mobile users | Fourth |
| **4a** | Scheduled tasks (cron engine) | 3-4 days | Medium — makes Lucy proactive | Fourth |
| **5** | Telegram bot | 3-4 days | Medium — reaches mobile users | Fifth |
| **6** | UX polish + command palette | 1-2 weeks | Medium — better daily usage | Ongoing |

---

## Tech Stack Additions

| New Dependency | Purpose | Why This One |
|---|---|---|
| `pgvector` | Vector similarity search in Supabase | Already in Supabase, no extra infra |
| `@modelcontextprotocol/sdk` | MCP client (already installed) | Official SDK, already in package.json |
| `grammy` | Telegram bot SDK | Same one AionUI uses, lightweight, TypeScript-native |
| `ai` (Vercel AI SDK) | Streaming + agent memory helpers | Next.js-native, maintained by Vercel |
| `node-cron` | Scheduled task execution | Lightweight, no dependencies |

---

## What We're NOT Building

Keeping scope sane:

- **NOT** a desktop Electron app (discussed separately, not part of v2 core)
- **NOT** a multi-agent orchestration engine (leave that to Captain Claw / CrewAI)
- **NOT** a code execution sandbox (Lucy is chat + workflows, not a code runner)
- **NOT** a vector database (use pgvector in Supabase, don't build one)
- **NOT** replacing the visual workflow builder (it stays, gets MCP tool nodes)

---

## Open Questions

1. **Memory extraction cost**: Each conversation ending triggers an LLM call to extract facts. How to handle this cost-effectively? Options: use cheaper model (Haiku), batch extractions, only extract from longer conversations.

2. **Standalone memory**: Without Supabase/pgvector, how good can localStorage-based memory be? Options: simple keyword matching, use Transformers.js for in-browser embeddings, or just don't support memory in standalone mode.

3. **MCP server runtime**: Should Lucy spawn MCP servers as child processes, or require users to run them externally? Spawning is easier for users but harder to manage.

4. **Captain Claw dependency**: Should Lucy depend on Captain Claw being installed, or should the integration be optional? Answer: optional — Lucy must work standalone, Captain Claw is an enhancement.

5. **lucyio agent scope**: What exactly should it do? Needs its own design doc.

---

## Architecture After v2

```
                    ┌──────────────┐
                    │   Channels   │
                    ├──────────────┤
                    │ Web (Next.js)│
                    │ Telegram     │
                    │ WhatsApp     │
                    │ Slack        │
                    │ Embed Widget │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │   LucyIO     │
                    │   Agent      │
                    │  (orchestr.) │
                    └──────┬───────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
   ┌──────▼──────┐ ┌──────▼──────┐ ┌───────▼──────┐
   │   Memory    │ │  MCP Hub    │ │  Workflows   │
   │             │ │             │ │              │
   │ Semantic    │ │ Tool Disc.  │ │ Visual       │
   │ Knowledge   │ │ Tool Exec.  │ │ Builder      │
   │ Extraction  │ │ Bridge Mode │ │ Engine       │
   └──────┬──────┘ └──────┬──────┘ └───────┬──────┘
          │                │                │
   ┌──────▼────────────────▼────────────────▼──────┐
   │              Storage Layer                     │
   │  Supabase (pgvector) | localStorage (standalone)│
   └────────────────────┬──────────────────────────┘
                        │
                 ┌──────▼──────┐
                 │  Providers  │
                 │ OpenAI      │
                 │ Anthropic   │
                 │ Google      │
                 │ Local (LLM) │
                 │ Captain Claw│
                 └─────────────┘
```

---

## What Makes Lucy Different

| Other platforms | Lucy |
|---|---|
| Chat-only | Chat + Workflows + Memory + MCP + Channels |
| Standalone app | Embeddable — lives inside your apps with one `<script>` tag |
| Single-user | Shared auth across your entire ecosystem |
| Desktop-only (Wayland) | Web + PWA + Desktop + Telegram + WhatsApp |
| Complex setup | Dual storage — works with zero config OR full Supabase |
| Generic | Integration registry — Lucy knows YOUR business data |
| Closed memory | Open memory — pgvector, your data, your control |
| Single agent | Bridge to Captain Claw, lucyio, and future agents |

---

## References

- [Mem0 — Memory Architecture](https://github.com/mem0ai/mem0)
- [Captain Claw — Cognitive Systems](https://github.com/kstevica/captain-claw)
- [AionUI — Multi-channel + Extensions](https://github.com/iOfficeAI/AionUi) (Apache-2.0)
- [LobeChat — MCP Marketplace](https://lobehub.com/mcp)
- [LibreChat — Deferred Tool Loading](https://github.com/danny-avila/librechat)
- [Mastra — TypeScript Agent Framework](https://github.com/mastra-ai/mastra)
- [Cognee — Graph + Vector Memory](https://github.com/topoteretes/cognee)
- [n8n — Bidirectional MCP Bridge](https://n8n.io/ai-agents/)
- [Vercel AI SDK 6 — Agent Memory](https://ai-sdk.dev/docs/agents/memory)
- [MCP Official Registry](https://registry.modelcontextprotocol.io/)
- [Wayland — Cognitive Memory Fork](https://github.com/ferroxlabs/wayland) (AGPL — study only)
