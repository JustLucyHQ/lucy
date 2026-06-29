# Lucy Memory System — Design Spec

**Status:** Approved (design) · **Date:** 2026-06-08 · **Phase:** 1
**Owner:** Johnny · **Author:** Lucy build session

---

## 1. Vision

Memory is Lucy's core differentiator. A business assistant that *remembers* — your
preferences, your projects, your clients, your decisions, the way you work — and gets
measurably smarter the more you use it. The bar is **business-grade quality**: clean,
trustworthy data and patterns, not a junk drawer of half-formed chatter.

Lucy captures two kinds of knowledge, weighted equally, plus a third pillar for continuity:

- **Semantic** — decontextualized facts and meaning. *"Acme runs on Postgres." "User prefers TypeScript."*
- **Pragmatic** — intent and working style. *"Wants code first, prose second." "Currently evaluating vendors."*
- **Episodic** — what happened, when. *"June 5 — shipped the auth refactor." "Last week we picked vendor X."*

## 2. Goals & Non-Goals

**Goals (Phase 1)**
- Durable memory across conversations, scoped to **user** and **project**.
- Works in **two deployment modes**: connected (Supabase/pgvector) and standalone (local).
- **Admin-gated** — memory is opt-in per deployment so storage/cost tracks real usage.
- **Privacy by design** — private by default; never auto-store secrets/PII; incognito conversations.
- **Observable** — storage usage visible; "Lucy used N memories" transparency with provenance.

**Non-Goals (deferred)**
- **Org / workspace tier** (cross-user business dashboard, cost tracking, residency) → *Phase C, separate Supabase project.*
- **Dreaming & prediction** (entity association graph, background consolidation, anticipation) → *Phase 2.*
- **Knowledge base / RAG & API/MCP exposure** → *Phase 1.5.*
- Procedural self-editing memory, full temporal knowledge graph → *later.*

## 3. Deployment modes

Memory is **decoupled** from Lucy's access-provider role. A host integration chooses:

| Mode | Storage | Retrieval | Notes |
|---|---|---|---|
| **Connected (SaaS)** | Supabase `lucy` schema + pgvector | hybrid semantic (vector + keyword, RRF) | the full product |
| **Standalone (local)** | IndexedDB | lexical (keyword + category + importance + recency) | 100% offline; settings shows the difference |
| **Key-provider (e.g. CTR-style embed)** | host app's own store | — | Lucy provides AI access only; **no Lucy memory** |

The same logical data model and the same write-time reconciliation logic run in both
connected and standalone modes — only the **retrieval primitive** differs (HNSW ANN vs.
brute-force/lexical). This keeps the two backends behavior-compatible.

## 4. Memory model

**Three layers**

| Layer | What | Status |
|---|---|---|
| L1 · Working memory | the live conversation in context | exists today |
| **L2 · Memory store** ⭐ | durable extracted knowledge — *this build* | **new** |
| L3 · Knowledge base | uploaded documents (RAG), "Lucy Documents" | Phase 1.5 |

**Profile vs. Collection** (the two halves of L2)

- **Profile** — a compact, always-current, merge-updated record per user (and per project):
  *name · role · company · durable preferences · communication style · active goals.*
  ~100 tokens, **never searched, always injected.** This is "who you are."
- **Collection** — the searchable store of semantic/pragmatic/episodic memories + entities.
  Retrieved on demand. This is "what you've discussed."

**Entities** — the salience layer. Named terms (clients, projects, products, jargon) with
`occurrence_count` + recency driving auto-importance. Recurring terms self-promote
("Acme Corp" across 15 chats becomes high-salience without anyone flagging it). Entities are
the hooks that wire memories together — the substrate the Phase 2 association graph grows on.

**Cross-cutting properties** on every collection memory:
- `scope` — `user_id` + `project_id?` + `org_id?` (dormant seam for Phase C)
- `visibility` — `private` (default) · `project` · `global`
- `source` — `extracted` · `user_remember` · `user_global` · `admin` (trust ranking)
- `type` — `semantic` · `pragmatic` · `episodic`
- `importance` — 1–10
- **bi-temporal** — `valid_at` / `invalid_at` (when true *in the world*) vs. `created_at`
  (when Lucy *learned* it). Nullable seam added now; point-in-time queries are later.

**Visibility trust ladder**
```
private   →  owner only (default — "everything else is private by design")
project   →  teammates on the project
global    →  user proposes via /global  (candidate shared knowledge)
Lucy Docs →  admin blesses it           (canonical, authoritative, outranks all)
```

## 5. Schema — connected (`lucy` schema, Postgres + pgvector)

```sql
-- The always-on profile (one row per user, optionally per project)
create table lucy.memory_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users,
  project_id uuid references lucy.projects(id),
  org_id uuid,                              -- dormant (Phase C)
  data jsonb not null default '{}',         -- merge-updated structured profile
  updated_at timestamptz default now(),
  unique (user_id, project_id)
);

-- The searchable collection
create table lucy.memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users,
  project_id uuid references lucy.projects(id),
  org_id uuid,                              -- dormant (Phase C)
  type text not null check (type in ('semantic','pragmatic','episodic')),
  category text,
  content text not null,
  summary text,                             -- one-line form for cheap injection
  importance int not null default 5,
  visibility text not null default 'private'
    check (visibility in ('private','project','global')),
  source text not null default 'extracted'
    check (source in ('extracted','user_remember','user_global','admin')),
  embedding halfvec(1536),                  -- dimension fixed per deployment
  fts tsvector generated always as (to_tsvector('english', coalesce(content,''))) stored,
  source_conversation_id uuid references lucy.conversations(id),
  access_count int default 0,
  last_accessed timestamptz,
  valid_at timestamptz,                     -- bi-temporal: true-in-world from
  invalid_at timestamptz,                   -- bi-temporal: ceased / superseded
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  expires_at timestamptz
);
create index on lucy.memories using hnsw (embedding halfvec_cosine_ops);
create index on lucy.memories using gin (fts);
create index on lucy.memories (user_id, project_id, visibility);

-- Salience layer
create table lucy.entities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users,
  project_id uuid references lucy.projects(id),
  org_id uuid,
  name text not null,
  normalized_name text not null,
  type text,                                -- client | product | person | term | project ...
  occurrence_count int default 1,
  importance int default 5,
  visibility text not null default 'private',
  first_seen timestamptz default now(),
  last_seen timestamptz default now(),
  unique (user_id, project_id, normalized_name)
);

-- Wiring (the Phase 2 association substrate)
create table lucy.memory_entities (
  memory_id uuid references lucy.memories(id) on delete cascade,
  entity_id uuid references lucy.entities(id) on delete cascade,
  primary key (memory_id, entity_id)
);

-- L3 stub (Phase 1.5) — "Lucy Documents" live here (source='admin', visibility='global')
-- create table lucy.knowledge_documents (...);
-- create table lucy.knowledge_chunks (...);
```

**RLS** — every table filters by `user_id`, widened by `visibility`: a row is readable if
`user_id = auth.uid()` **OR** (`visibility = 'project'` AND the user is a member of
`project_id`) **OR** `visibility = 'global'`. Soft-delete (archive) and the deletion grace
window are enforced in the application layer.

## 6. Schema — standalone (IndexedDB)

Object stores mirror the tables (`memory_profiles`, `memories`, `entities`,
`memory_entities`), minus `embedding`/`fts`. Retrieval is lexical. `/global` in local mode
means *"across all my own projects"* (there are no other users).

## 7. The storage seam

```ts
interface MemoryStore {
  getProfile(scope): Promise<Profile | null>
  upsertProfile(scope, patch): Promise<void>        // field-level merge
  store(memories: MemoryWrite[]): Promise<void>
  search(query: string, scope, opts): Promise<Memory[]>   // vector+RRF | lexical, same signature
  reconcile(candidates, scope): Promise<ReconcilePlan>    // ADD/UPDATE/MERGE/SKIP
  promote(id, visibility): Promise<void>            // /global, admin bless
  touchEntities(entities, scope): Promise<void>     // salience bump
  archive(id): Promise<void>                        // soft-delete
  purgeExpiredArchives(graceDays): Promise<number>  // hard-delete after grace
  decay(): Promise<void>
  usage(scope): Promise<{ memories: number; entities: number; bytes: number }>
}
```

`SupabaseMemoryStore` (pgvector/HNSW) and `LocalMemoryStore` (IndexedDB) implement it.
The rest of Lucy never knows which mode it's in — mirrors the existing `StorageAdapter` pattern.

## 8. Capture pipeline

**Triggers**
1. **End-of-conversation pass** — fires when a conversation goes idle or you switch away.
   One LLM call reads the whole thread. Client-initiated, identical in both modes (no server cron).
2. **`/remember <x>`** — instant pin, high importance, `source=user_remember`.
3. **`/global <x>`** — instant pin, `visibility=global`, `source=user_global`.
4. **Incognito conversation** — extraction skipped entirely.

**Extraction (reconciliation-aware)**
The extraction prompt receives the transcript **plus the top related existing memories**, and
returns a schema-validated (Zod) plan: for each candidate, **ADD** / **UPDATE** / **MERGE** /
**SKIP**, across three buckets (semantic, pragmatic, episodic) plus **entities** and **profile
patches**. This folds dedup + contradiction into one smart pass.

**Privacy guard** — a pre-store filter (pattern + LLM) drops secrets, credentials, API keys,
and PII. These are never written to memory.

**Dedup / contradiction**
- Duplicate: connected → cosine similarity > **~0.88** routes to UPDATE/SKIP; local → `category:identifier` entity-key + normalized text.
- Contradiction policy (admin setting):
  - `supersede` (default) — old memory gets `invalid_at = now()`, new replaces. Store reflects current truth.
  - `keep_history` (enterprise default) — nothing removed; full bi-temporal trail for audit.

**Importance scoring**
```
importance = clamp( base(1–10 from extraction)
                    × source_weight(admin > user_global > user_remember > extracted)
                    + entity_salience(occurrence_count + recency), 1, 10 )
```

**Cost control** — one extraction call per *conversation* (not per message); embeddings
batched in one API call; an **importance floor** drops low-value extractions before storage;
the whole pipeline is a **no-op when the admin memory gate is off**.

## 9. Retrieval & injection

Fires before each Lucy reply, using the current message as the query.

```
1. QUERY    current message → embed (connected) | keywords (local)
2. SCOPE    filter to: own private ∪ active-project ∪ global ∪ Lucy Docs
3. SEARCH   connected: vector (HNSW, cosine) + keyword (FTS) → fuse via RRF (k=60)
            local:     keyword + category match
4. RANK     base RRF/lexical score × importance × recency; Lucy Docs trust boost
5. SELECT   top-N within TOKEN BUDGET (~800 tokens / ~12 items)
6. TOUCH    bump access_count + last_accessed (reinforcement; resists decay)
```

**Injection** — prepended to the system prompt, grouped for clean reading:
```
## Who you are            (profile — always present, ~100 tok)
Johnny · founder · TypeScript, code-first, concise

## What Lucy knows        (collection — retrieved for THIS message)
Facts:        Acme runs on Postgres · prod DB is read-only
Preferences:  code-first answers
Recently:     June 5 — shipped auth refactor
Relevant:     [Acme Corp] [Project Phoenix]
Lucy Docs:    [Onboarding policy v2]
```

## 10. Decay

Importance fades over time **unless reinforced** by access or entity recurrence. Decay is
**category-specific**: pragmatic/intent fast, semantic facts slow, entities resist via salience.
Default exponential **half-life 21 days**; untouched low-importance memories eventually prune.
Connected runs decay lazily on access (no cron dependency); local runs on load.

## 11. Embeddings

Embedder is **admin-configurable**, decoupled from the chat provider:
- **Default:** OpenAI `text-embedding-3-small` (1536, stored as `halfvec`).
- **Self-host / residency:** point at Ollama (`nomic-embed-text`) or Google — the migration
  sizes the `vector()`/`halfvec()` dimension to match. One embedder per deployment ⇒ consistent
  dimensions, no per-row mismatch.
- **No embedder available:** connected mode degrades gracefully to lexical (local-mode behavior).

## 12. Admin & settings

A dedicated **Admin Settings** area (settings are proliferating — admin-level config is separated
from per-user config):

- **Memory gate** — on/off per deployment.
- **Embedder** — provider/model/dimension.
- **Deletion grace window** — default **30 days**.
- **Contradiction policy** — `supersede` | `keep_history`.
- **Storage usage** — live (Supabase) and local (IndexedDB): # memories, # entities, approx size.
  (The seed of the Phase C cost dashboard.)

Per-user settings: memory on/off (within admin allowance), incognito toggle, view/export/delete.

## 13. Memory management UI

- Browse/search your memories; view your profile.
- `/remember` and `/global` from chat.
- **Deletion is soft, staged, and scary:** export → **archive** → admin-configured **grace
  period (default 30d)** → hard delete. Extreme-warning confirmation before any dump.
- **Transparency affordance** — "🧠 Lucy used N memories" under replies, each linking back to its
  `source_conversation_id` (provenance → trust).

## 14. Module layout (`lib/memory/`)

```
types.ts          shared types + Zod schemas
store.ts          MemoryStore interface + factory (mode selection)
supabase-store.ts pgvector/HNSW/RRF implementation
local-store.ts    IndexedDB + lexical implementation
embeddings.ts     admin-configurable embedder (OpenAI default)
extractor.ts      reconciliation-aware end-of-conversation pass
privacy.ts        secrets/PII guard
retriever.ts      query → scope → search → rank → select
injector.ts       profile + collection → system-prompt block
profile.ts        profile merge logic
decay.ts          category-specific reinforcement decay
commands.ts       /remember, /global parsing
index.ts          public surface
```

## 15. Phasing

- **Phase 1 (this spec)** — the memory engine: schema, store seam + both backends, capture
  (end-of-conversation + `/remember` + `/global` + incognito), semantic/pragmatic/episodic +
  entities + profile, reconciliation-aware extraction, privacy guard, hybrid retrieval +
  injection, decay, admin settings + storage usage, memory management (archive → grace → delete),
  transparency.
- **Phase 1.5** — L3 knowledge base (doc upload + RAG), **Lucy Documents** admin curation,
  memory exposed via Lucy's **API + MCP server** so embedded apps get real project-scoped memory.
- **Phase 2** — entity **association graph** ("neurology"), background **dreaming** (consolidation
  → insights), **prediction**, rolling extraction if it earns its keep.
- **Phase C** *(separate Supabase project)* — org/workspace tier, business dashboard,
  cross-user/cross-project views, cost tracking, data residency, settings-manager role.

Each phase lights up seams the previous one leaves in place — nothing gets re-architected.

## 16. Open items

- **Global knowledge moderation** at scale — who may promote to `global`; preventing pollution
  (admin "Lucy Documents" curation is the Phase 1 answer; broader trust model is later).
- **Point-in-time query UI** — uses the bi-temporal seam; surfaced when enterprise/keep_history matures.
- **Cost dashboard** — Phase C, builds on the Phase 1 storage-usage panel.

## 17. Prior art

Patterns drawn from current memory-system research: reconciliation-aware extraction
(ADD/UPDATE/MERGE/SKIP), profile-vs-collection split, bi-temporal validity, hybrid retrieval via
Reciprocal Rank Fusion, salience-weighted entities, and category-specific reinforcement decay.

---

*DeepSeek provider integration is tracked separately — it follows the existing provider pattern
and is not part of this spec.*
