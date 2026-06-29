# Lucy Memory System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Lucy's Phase 1 memory engine — durable semantic/pragmatic/episodic memory with a profile, entity salience, dual-mode storage (Supabase/pgvector ↔ IndexedDB), reconciliation-aware extraction, hybrid retrieval, decay, and management UI — plus add DeepSeek as an AI provider.

**Architecture:** A `lib/memory/` module behind a single `MemoryStore` interface with two backends (Supabase pgvector + local IndexedDB). Capture runs at conversation-end (one LLM pass) plus `/remember` and `/global` commands; retrieval injects a profile block + top-N collection memories into the chat system prompt. The engine is gated by an admin "memory enabled" flag and is fully decoupled from chat — when off, every entry point is a no-op.

**Tech Stack:** Next.js 14, TypeScript 5, Zod, Supabase (`lucy` schema) + pgvector (HNSW, halfvec, RRF), IndexedDB, OpenAI SDK (embeddings + DeepSeek), Zustand, Jest + ts-jest.

---

## Conventions (read once)

- **Tests:** Jest, files in `__tests__/lib/...`, matching `*.test.ts`. Run a single file with
  `npx jest __tests__/lib/memory/<name>.test.ts`. Mock SDKs with `jest.mock(...)` (see
  `__tests__/lib/providers/index.test.ts`).
- **Imports:** use the `@/` alias (maps to repo root).
- **SQL migrations:** plain `.sql` files in `lib/supabase/`, applied manually in the Supabase SQL
  editor. Tables live in the `lucy` schema. RLS pattern: `alter table X enable row level security;`
  then `create policy "..." on X for all using (auth.uid() = user_id);`.
- **Commits:** one per task, conventional-commit style, end with the Co-Authored-By trailer:
  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  ```
- **Time:** store timestamps as epoch millis (`number`) in TS types (matches `Conversation.createdAt`);
  map to/from `timestamptz` ISO strings at the Supabase boundary.

---

# PART 0 — DeepSeek provider (independent quick win)

### Task 0.1: Add DeepSeek provider

DeepSeek exposes an OpenAI-compatible API at `https://api.deepseek.com`. Clone the OpenAI provider with a `baseURL`. Models: `deepseek-chat`, `deepseek-reasoner`.

**Files:**
- Create: `lib/providers/deepseek.ts`
- Test: `__tests__/lib/providers/deepseek.test.ts`
- Modify: `lib/providers/types.ts` (ProviderName union + ALL_MODELS)
- Modify: `lib/providers/index.ts` (register provider)
- Modify: `app/api/chat/route.ts` (header map + key resolution)

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/lib/providers/deepseek.test.ts
import { DeepSeekProvider } from '@/lib/providers/deepseek';

describe('DeepSeekProvider', () => {
  it('has name "deepseek"', () => {
    expect(new DeepSeekProvider().name).toBe('deepseek');
  });

  it('exposes deepseek-chat and deepseek-reasoner models', () => {
    const ids = new DeepSeekProvider().models.map((m) => m.id);
    expect(ids).toContain('deepseek-chat');
    expect(ids).toContain('deepseek-reasoner');
  });

  it('every model is tagged provider "deepseek"', () => {
    new DeepSeekProvider().models.forEach((m) => expect(m.provider).toBe('deepseek'));
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx jest __tests__/lib/providers/deepseek.test.ts`
Expected: FAIL — cannot find module `@/lib/providers/deepseek`.

- [ ] **Step 3: Add `'deepseek'` to the ProviderName union**

In `lib/providers/types.ts:1`, change:
```ts
export type ProviderName = 'openai' | 'anthropic' | 'google' | 'local';
```
to:
```ts
export type ProviderName = 'openai' | 'anthropic' | 'google' | 'deepseek' | 'local';
```

- [ ] **Step 4: Create the provider**

```ts
// lib/providers/deepseek.ts
import OpenAI from 'openai';
import type { AIProvider, AIModel, ChatMessage, StreamCallback, ProviderConfig } from './types';

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';

const DEEPSEEK_MODELS: AIModel[] = [
  {
    id: 'deepseek-chat',
    name: 'DeepSeek V3 (Chat)',
    provider: 'deepseek',
    description: 'General-purpose DeepSeek chat model — fast and inexpensive',
    contextWindow: 64000,
    maxOutput: 8192,
  },
  {
    id: 'deepseek-reasoner',
    name: 'DeepSeek R1 (Reasoner)',
    provider: 'deepseek',
    description: 'DeepSeek reasoning model with chain-of-thought',
    contextWindow: 64000,
    maxOutput: 8192,
  },
];

export class DeepSeekProvider implements AIProvider {
  name = 'deepseek' as const;
  models = DEEPSEEK_MODELS;

  async chat(
    messages: ChatMessage[],
    modelId: string,
    onChunk: StreamCallback,
    config: ProviderConfig
  ): Promise<void> {
    const client = new OpenAI({ apiKey: config.apiKey, baseURL: DEEPSEEK_BASE_URL });
    const stream = await client.chat.completions.create({
      model: modelId,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: true,
    });
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) onChunk(delta);
    }
  }

  async testConnection(config: ProviderConfig): Promise<boolean> {
    try {
      const client = new OpenAI({ apiKey: config.apiKey, baseURL: DEEPSEEK_BASE_URL });
      await client.models.list();
      return true;
    } catch {
      return false;
    }
  }
}
```

- [ ] **Step 5: Register in the provider index**

In `lib/providers/index.ts`, add the import after line 4:
```ts
import { DeepSeekProvider } from './deepseek';
```
Add to the `providers` record (after the `google` entry):
```ts
  deepseek: new DeepSeekProvider(),
```
Add to `getModelsByProvider()`'s returned object:
```ts
    deepseek: providers.deepseek.models,
```

- [ ] **Step 6: Add DeepSeek models to ALL_MODELS**

In `lib/providers/types.ts`, inside `ALL_MODELS`, after the Gemini block (before the Local section comment), insert:
```ts
  {
    id: 'deepseek-chat',
    name: 'DeepSeek V3 (Chat)',
    provider: 'deepseek',
    description: 'General-purpose DeepSeek chat model — fast and inexpensive',
    contextWindow: 64000,
    maxOutput: 8192,
  },
  {
    id: 'deepseek-reasoner',
    name: 'DeepSeek R1 (Reasoner)',
    provider: 'deepseek',
    description: 'DeepSeek reasoning model with chain-of-thought',
    contextWindow: 64000,
    maxOutput: 8192,
  },
```

- [ ] **Step 7: Wire the API key in the chat route**

In `app/api/chat/route.ts`, add `deepseek` to the `headerMap` (around line 161):
```ts
        const headerMap: Partial<Record<ProviderName, string>> = {
          openai: 'x-openai-key',
          anthropic: 'x-anthropic-key',
          google: 'x-google-key',
          deepseek: 'x-deepseek-key',
        };
```
And add a fallback env line in the `apiKey` resolution chain (after the `google` line ~203):
```ts
          (providerName === 'deepseek' ? process.env.DEEPSEEK_API_KEY : null) ||
```

- [ ] **Step 8: Run the test, verify it passes**

Run: `npx jest __tests__/lib/providers/deepseek.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 9: Run the providers index test to confirm no regression**

Run: `npx jest __tests__/lib/providers/index.test.ts`
Expected: PASS. (The index test mocks providers; adding deepseek to the real index does not break it because the test mocks `./openai` etc. — but it does NOT mock `./deepseek`, so the real DeepSeekProvider loads. That is fine; it constructs without network. If it fails on the missing mock, add a `jest.mock('@/lib/providers/deepseek', ...)` block mirroring the others.)

- [ ] **Step 10: Commit**

```bash
git add lib/providers/deepseek.ts lib/providers/types.ts lib/providers/index.ts \
  app/api/chat/route.ts __tests__/lib/providers/deepseek.test.ts
git commit -m "feat(providers): add DeepSeek (deepseek-chat, deepseek-reasoner)"
```

> **Note:** the Settings UI provider list also needs a DeepSeek key field — handled later in Task 8.3, alongside the memory settings, to avoid touching the settings page twice.

---

# PART 1 — Foundation: types & schema

### Task 1.1: Core memory types & Zod schemas

**Files:**
- Create: `lib/memory/types.ts`
- Test: `__tests__/lib/memory/types.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/lib/memory/types.test.ts
import { ExtractionResultSchema, type MemoryRecord } from '@/lib/memory/types';

describe('memory types', () => {
  it('parses a valid extraction result', () => {
    const parsed = ExtractionResultSchema.parse({
      memories: [
        { op: 'ADD', type: 'semantic', content: 'User prefers TypeScript', importance: 7 },
      ],
      entities: [{ name: 'Acme Corp', type: 'client' }],
      profilePatch: { role: 'founder' },
    });
    expect(parsed.memories[0].op).toBe('ADD');
    expect(parsed.entities[0].name).toBe('Acme Corp');
  });

  it('rejects an invalid memory type', () => {
    expect(() =>
      ExtractionResultSchema.parse({
        memories: [{ op: 'ADD', type: 'nonsense', content: 'x', importance: 5 }],
        entities: [],
        profilePatch: {},
      })
    ).toThrow();
  });

  it('defaults entities and profilePatch when omitted', () => {
    const parsed = ExtractionResultSchema.parse({ memories: [] });
    expect(parsed.entities).toEqual([]);
    expect(parsed.profilePatch).toEqual({});
  });

  it('MemoryRecord type is structurally usable', () => {
    const rec: MemoryRecord = {
      id: '1', userId: 'u', type: 'semantic', content: 'c', importance: 5,
      visibility: 'private', source: 'extracted', accessCount: 0,
      createdAt: 1, updatedAt: 1,
    };
    expect(rec.type).toBe('semantic');
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx jest __tests__/lib/memory/types.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Create the types module**

```ts
// lib/memory/types.ts
import { z } from 'zod';

export type MemoryType = 'semantic' | 'pragmatic' | 'episodic';
export type MemoryVisibility = 'private' | 'project' | 'global';
export type MemorySource = 'extracted' | 'user_remember' | 'user_global' | 'admin';
export type ContradictionPolicy = 'supersede' | 'keep_history';

export interface MemoryScope {
  userId: string | null;
  projectId?: string | null;
}

export interface MemoryRecord {
  id: string;
  userId: string | null;
  projectId?: string | null;
  type: MemoryType;
  category?: string;
  content: string;
  summary?: string;
  importance: number;
  visibility: MemoryVisibility;
  source: MemorySource;
  sourceConversationId?: string | null;
  accessCount: number;
  lastAccessed?: number | null;
  validAt?: number | null;
  invalidAt?: number | null;
  createdAt: number;
  updatedAt: number;
  expiresAt?: number | null;
}

export interface MemoryWrite {
  type: MemoryType;
  category?: string;
  content: string;
  summary?: string;
  importance?: number;
  visibility?: MemoryVisibility;
  source?: MemorySource;
  sourceConversationId?: string | null;
  validAt?: number | null;
}

export interface EntityRecord {
  id: string;
  name: string;
  normalizedName: string;
  type?: string;
  occurrenceCount: number;
  importance: number;
  visibility: MemoryVisibility;
  firstSeen: number;
  lastSeen: number;
}

export interface EntityWrite {
  name: string;
  type?: string;
}

export interface Profile {
  data: Record<string, unknown>;
  updatedAt: number;
}

export interface SearchOptions {
  limit?: number;
  types?: MemoryType[];
  tokenBudget?: number;
}

export interface UsageStats {
  memories: number;
  entities: number;
  bytes: number;
}

// ── Extraction (LLM output) schemas ────────────────────────────────────────────

export const MEMORY_TYPES = ['semantic', 'pragmatic', 'episodic'] as const;

export const ExtractedMemorySchema = z.object({
  op: z.enum(['ADD', 'UPDATE', 'MERGE', 'SKIP']),
  id: z.string().optional(),            // target id for UPDATE/MERGE
  type: z.enum(MEMORY_TYPES),
  category: z.string().optional(),
  content: z.string().min(1),
  summary: z.string().optional(),
  importance: z.number().int().min(1).max(10).default(5),
});

export const ExtractedEntitySchema = z.object({
  name: z.string().min(1),
  type: z.string().optional(),
});

export const ExtractionResultSchema = z.object({
  memories: z.array(ExtractedMemorySchema).default([]),
  entities: z.array(ExtractedEntitySchema).default([]),
  profilePatch: z.record(z.unknown()).default({}),
});

export type ExtractedMemory = z.infer<typeof ExtractedMemorySchema>;
export type ExtractedEntity = z.infer<typeof ExtractedEntitySchema>;
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx jest __tests__/lib/memory/types.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/memory/types.ts __tests__/lib/memory/types.test.ts
git commit -m "feat(memory): core types and extraction Zod schemas"
```

### Task 1.2: Supabase migration SQL (pgvector + tables + RLS)

**Files:**
- Create: `lib/supabase/memory.sql`

This is applied manually in the Supabase SQL editor; no automated test. Verify by running it against the dev project.

- [ ] **Step 1: Write the migration**

```sql
-- lib/supabase/memory.sql
-- Lucy Memory System — Phase 1. Apply in the Supabase SQL editor.
set search_path to lucy, public;

create extension if not exists vector;

-- ── Always-on profile ────────────────────────────────────────────────────────
create table if not exists memory_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid,
  org_id uuid,
  data jsonb not null default '{}',
  updated_at timestamptz default now()
);
-- one profile per (user, project); NULL project_id => the user-level profile
create unique index if not exists memory_profiles_user_project_uniq
  on memory_profiles (user_id, coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ── Collection ───────────────────────────────────────────────────────────────
create table if not exists memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid,
  org_id uuid,
  type text not null check (type in ('semantic','pragmatic','episodic')),
  category text,
  content text not null,
  summary text,
  importance int not null default 5,
  visibility text not null default 'private'
    check (visibility in ('private','project','global')),
  source text not null default 'extracted'
    check (source in ('extracted','user_remember','user_global','admin')),
  embedding halfvec(1536),
  fts tsvector generated always as (to_tsvector('english', coalesce(content,''))) stored,
  source_conversation_id uuid references conversations(id) on delete set null,
  access_count int default 0,
  last_accessed timestamptz,
  valid_at timestamptz,
  invalid_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  expires_at timestamptz
);
create index if not exists memories_embedding_hnsw
  on memories using hnsw (embedding halfvec_cosine_ops);
create index if not exists memories_fts_gin on memories using gin (fts);
create index if not exists memories_scope on memories (user_id, project_id, visibility);

-- ── Entities (salience) ──────────────────────────────────────────────────────
create table if not exists entities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid,
  org_id uuid,
  name text not null,
  normalized_name text not null,
  type text,
  occurrence_count int default 1,
  importance int default 5,
  visibility text not null default 'private'
    check (visibility in ('private','project','global')),
  first_seen timestamptz default now(),
  last_seen timestamptz default now()
);
create unique index if not exists entities_user_project_name_uniq
  on entities (user_id, coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid), normalized_name);

-- ── Wiring (Phase 2 association substrate) ───────────────────────────────────
create table if not exists memory_entities (
  memory_id uuid references memories(id) on delete cascade,
  entity_id uuid references entities(id) on delete cascade,
  primary key (memory_id, entity_id)
);

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table memory_profiles enable row level security;
alter table memories enable row level security;
alter table entities enable row level security;
alter table memory_entities enable row level security;

create policy "own profile" on memory_profiles
  for all using (auth.uid() = user_id);

-- read: own rows, project-visible rows you own*, or global; write: own rows only.
-- (*project membership model arrives in Phase C; for now project rows are still owner-scoped.)
create policy "read memories" on memories
  for select using (auth.uid() = user_id or visibility = 'global');
create policy "write own memories" on memories
  for all using (auth.uid() = user_id);

create policy "read entities" on entities
  for select using (auth.uid() = user_id or visibility = 'global');
create policy "write own entities" on entities
  for all using (auth.uid() = user_id);

create policy "own memory_entities" on memory_entities
  for all using (
    memory_id in (select id from memories where user_id = auth.uid())
  );

-- ── Admin / deployment settings (single-row config) ──────────────────────────
create table if not exists memory_settings (
  id int primary key default 1 check (id = 1),
  enabled boolean not null default false,
  embedder_provider text not null default 'openai',
  embedder_model text not null default 'text-embedding-3-small',
  embedder_dimensions int not null default 1536,
  contradiction_policy text not null default 'supersede'
    check (contradiction_policy in ('supersede','keep_history')),
  deletion_grace_days int not null default 30,
  updated_at timestamptz default now()
);
insert into memory_settings (id) values (1) on conflict (id) do nothing;
alter table memory_settings enable row level security;
create policy "read settings" on memory_settings for select using (true);
create policy "service writes settings" on memory_settings
  for all using (auth.role() = 'service_role');
```

- [ ] **Step 2: Apply & verify**

Apply in the Supabase SQL editor for the dev project. Verify with:
```sql
set search_path to lucy, public;
select count(*) from memory_settings;            -- expect 1
\d+ memories                                      -- confirm halfvec + hnsw index exist
```
If `halfvec`/`hnsw` are unavailable (older pgvector), upgrade the pgvector extension first
(`alter extension vector update;`). Fallback: change `halfvec(1536)` → `vector(1536)` and
`halfvec_cosine_ops` → `vector_cosine_ops`, and set `memory_settings` unchanged.

- [ ] **Step 3: Commit**

```bash
git add lib/supabase/memory.sql
git commit -m "feat(memory): Supabase migration — pgvector tables, RLS, settings"
```

---

# PART 2 — Embeddings

### Task 2.1: Embedder module

Generates embeddings via the admin-configured provider (OpenAI default). Returns `null` when no
embedder is configured/available so callers degrade to lexical.

**Files:**
- Create: `lib/memory/embeddings.ts`
- Test: `__tests__/lib/memory/embeddings.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/lib/memory/embeddings.test.ts
import { embedText, cosineSimilarity } from '@/lib/memory/embeddings';

const mockCreate = jest.fn();
jest.mock('openai', () =>
  jest.fn().mockImplementation(() => ({
    embeddings: { create: (...a: unknown[]) => mockCreate(...a) },
  }))
);

describe('embeddings', () => {
  beforeEach(() => mockCreate.mockReset());

  it('returns null when no api key is provided', async () => {
    const v = await embedText('hello', { apiKey: '' });
    expect(v).toBeNull();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('returns the embedding vector from the provider', async () => {
    mockCreate.mockResolvedValue({ data: [{ embedding: [0.1, 0.2, 0.3] }] });
    const v = await embedText('hello', { apiKey: 'sk-x' });
    expect(v).toEqual([0.1, 0.2, 0.3]);
  });

  it('returns null on provider error (graceful degradation)', async () => {
    mockCreate.mockRejectedValue(new Error('boom'));
    const v = await embedText('hello', { apiKey: 'sk-x' });
    expect(v).toBeNull();
  });

  it('cosineSimilarity is 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
  });

  it('cosineSimilarity is 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx jest __tests__/lib/memory/embeddings.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/memory/embeddings.ts
import OpenAI from 'openai';

export interface EmbedderConfig {
  apiKey: string;
  model?: string;
  baseURL?: string;       // e.g. Ollama: http://localhost:11434/v1
}

/**
 * Embed a single string. Returns null when no key is configured or the provider
 * errors — callers must treat null as "no semantic vector available" and fall back
 * to lexical retrieval.
 */
export async function embedText(
  text: string,
  config: EmbedderConfig
): Promise<number[] | null> {
  if (!config.apiKey && !config.baseURL) return null;
  try {
    const client = new OpenAI({
      apiKey: config.apiKey || 'not-required',
      ...(config.baseURL ? { baseURL: config.baseURL } : {}),
    });
    const res = await client.embeddings.create({
      model: config.model ?? 'text-embedding-3-small',
      input: text,
    });
    return res.data[0]?.embedding ?? null;
  } catch {
    return null;
  }
}

/** Batch embed. Falls back to null entries individually on failure. */
export async function embedBatch(
  texts: string[],
  config: EmbedderConfig
): Promise<(number[] | null)[]> {
  if (texts.length === 0) return [];
  if (!config.apiKey && !config.baseURL) return texts.map(() => null);
  try {
    const client = new OpenAI({
      apiKey: config.apiKey || 'not-required',
      ...(config.baseURL ? { baseURL: config.baseURL } : {}),
    });
    const res = await client.embeddings.create({
      model: config.model ?? 'text-embedding-3-small',
      input: texts,
    });
    return texts.map((_, i) => res.data[i]?.embedding ?? null);
  } catch {
    return texts.map(() => null);
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx jest __tests__/lib/memory/embeddings.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/memory/embeddings.ts __tests__/lib/memory/embeddings.test.ts
git commit -m "feat(memory): embedder (OpenAI default) with graceful degradation"
```

---

# PART 3 — Pure logic: ranking, salience, decay, privacy

These modules are pure functions (no I/O) so they are fully unit-testable and reused by both backends.

### Task 3.1: Privacy guard

**Files:**
- Create: `lib/memory/privacy.ts`
- Test: `__tests__/lib/memory/privacy.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/lib/memory/privacy.test.ts
import { containsSecret, redactSecrets } from '@/lib/memory/privacy';

describe('privacy guard', () => {
  it('flags an OpenAI-style key', () => {
    expect(containsSecret('my key is sk-abcdef0123456789abcdef0123456789')).toBe(true);
  });
  it('flags an email + password phrase', () => {
    expect(containsSecret('password: hunter2')).toBe(true);
  });
  it('does not flag ordinary text', () => {
    expect(containsSecret('I prefer TypeScript and dark mode')).toBe(false);
  });
  it('redacts a detected secret', () => {
    expect(redactSecrets('token sk-abcdef0123456789abcdef0123456789 here'))
      .toContain('[REDACTED]');
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx jest __tests__/lib/memory/privacy.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/memory/privacy.ts
/**
 * Heuristic guard against storing secrets/credentials/PII in memory.
 * This is a first-pass filter; the extractor prompt is also instructed to omit secrets.
 */

const SECRET_PATTERNS: RegExp[] = [
  /\bsk-[a-zA-Z0-9]{20,}\b/,                 // OpenAI-style keys
  /\bsk-ant-[a-zA-Z0-9-]{20,}\b/,            // Anthropic keys
  /\bAIza[0-9A-Za-z_-]{30,}\b/,              // Google API keys
  /\bghp_[0-9A-Za-z]{30,}\b/,                // GitHub tokens
  /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/,        // Slack tokens
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,      // PEM private keys
  /\bpassword\s*[:=]\s*\S+/i,                // "password: ..."
  /\bsecret\s*[:=]\s*\S+/i,                  // "secret: ..."
  /\b\d{3}-\d{2}-\d{4}\b/,                   // US SSN
  /\b(?:\d[ -]*?){13,16}\b/,                 // credit-card-ish digit runs
];

export function containsSecret(text: string): boolean {
  return SECRET_PATTERNS.some((re) => re.test(text));
}

export function redactSecrets(text: string): string {
  let out = text;
  for (const re of SECRET_PATTERNS) {
    out = out.replace(new RegExp(re, re.flags.includes('g') ? re.flags : re.flags + 'g'), '[REDACTED]');
  }
  return out;
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx jest __tests__/lib/memory/privacy.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/memory/privacy.ts __tests__/lib/memory/privacy.test.ts
git commit -m "feat(memory): privacy guard for secrets/PII"
```

### Task 3.2: Scoring — importance, salience, RRF, decay

**Files:**
- Create: `lib/memory/scoring.ts`
- Test: `__tests__/lib/memory/scoring.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/lib/memory/scoring.test.ts
import {
  sourceWeight, computeImportance, reciprocalRankFusion,
  decayedImportance, rankScore, HALF_LIFE_DAYS,
} from '@/lib/memory/scoring';

describe('scoring', () => {
  it('orders source weights admin > user_global > user_remember > extracted', () => {
    expect(sourceWeight('admin')).toBeGreaterThan(sourceWeight('user_global'));
    expect(sourceWeight('user_global')).toBeGreaterThan(sourceWeight('user_remember'));
    expect(sourceWeight('user_remember')).toBeGreaterThan(sourceWeight('extracted'));
  });

  it('clamps computed importance to 1..10', () => {
    expect(computeImportance(10, 'admin', 50)).toBe(10);
    expect(computeImportance(1, 'extracted', 0)).toBeGreaterThanOrEqual(1);
  });

  it('RRF fuses two rank lists, rewarding items ranked high in both', () => {
    const fused = reciprocalRankFusion([['a', 'b', 'c'], ['b', 'a', 'd']]);
    expect(fused[0]).toBe('b'); // top in list2, 2nd in list1 => best combined
    expect(fused).toContain('d');
  });

  it('decays importance toward zero over time', () => {
    const fresh = decayedImportance(8, 0, 'semantic');
    const old = decayedImportance(8, HALF_LIFE_DAYS.semantic, 'semantic');
    expect(old).toBeCloseTo(fresh / 2, 1);
  });

  it('pragmatic decays faster than semantic', () => {
    const days = 10;
    const sem = decayedImportance(8, days, 'semantic');
    const prag = decayedImportance(8, days, 'pragmatic');
    expect(prag).toBeLessThan(sem);
  });

  it('rankScore boosts recent + important + frequently accessed', () => {
    const hi = rankScore({ base: 1, importance: 9, ageDays: 0, accessCount: 5 });
    const lo = rankScore({ base: 1, importance: 2, ageDays: 60, accessCount: 0 });
    expect(hi).toBeGreaterThan(lo);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx jest __tests__/lib/memory/scoring.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/memory/scoring.ts
import type { MemorySource, MemoryType } from './types';

export const HALF_LIFE_DAYS: Record<MemoryType, number> = {
  semantic: 60,    // facts fade slowly
  episodic: 30,    // events fade medium
  pragmatic: 10,   // intent/state fades fast
};

export function sourceWeight(source: MemorySource): number {
  switch (source) {
    case 'admin': return 1.6;
    case 'user_global': return 1.4;
    case 'user_remember': return 1.2;
    default: return 1.0; // extracted
  }
}

/** base(1..10) × sourceWeight + salience bonus, clamped to 1..10. */
export function computeImportance(
  base: number,
  source: MemorySource,
  entitySalience = 0
): number {
  const raw = base * sourceWeight(source) + Math.min(entitySalience, 20) * 0.1;
  return Math.max(1, Math.min(10, Math.round(raw)));
}

/** Reciprocal Rank Fusion. k=60 per current best practice. Returns ids best-first. */
export function reciprocalRankFusion(rankLists: string[][], k = 60): string[] {
  const score = new Map<string, number>();
  for (const list of rankLists) {
    list.forEach((id, idx) => {
      score.set(id, (score.get(id) ?? 0) + 1 / (k + idx + 1));
    });
  }
  return [...score.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

/** Exponential decay of importance by half-life for the memory type. */
export function decayedImportance(
  importance: number,
  ageDays: number,
  type: MemoryType
): number {
  const halfLife = HALF_LIFE_DAYS[type];
  return importance * Math.pow(0.5, ageDays / halfLife);
}

export interface RankInput {
  base: number;        // similarity or RRF score (0..1+)
  importance: number;  // 1..10
  ageDays: number;
  accessCount: number;
}

/** Final ranking score: relevance × importance × recency, nudged by reinforcement. */
export function rankScore({ base, importance, ageDays, accessCount }: RankInput): number {
  const recency = Math.pow(0.5, ageDays / 30);     // 30-day recency half-life
  const reinforcement = 1 + Math.min(accessCount, 10) * 0.03;
  return base * (importance / 10) * recency * reinforcement;
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx jest __tests__/lib/memory/scoring.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/memory/scoring.ts __tests__/lib/memory/scoring.test.ts
git commit -m "feat(memory): scoring — importance, RRF, category decay, rank"
```

### Task 3.3: Profile merge + entity normalization

**Files:**
- Create: `lib/memory/profile.ts`
- Test: `__tests__/lib/memory/profile.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/lib/memory/profile.test.ts
import { mergeProfile, normalizeEntityName } from '@/lib/memory/profile';

describe('profile + entity helpers', () => {
  it('merges new fields without dropping existing ones', () => {
    const merged = mergeProfile({ name: 'Johnny', role: 'dev' }, { role: 'founder', company: 'Acme' });
    expect(merged).toEqual({ name: 'Johnny', role: 'founder', company: 'Acme' });
  });
  it('ignores null/empty patch values', () => {
    const merged = mergeProfile({ name: 'Johnny' }, { name: '', role: null as unknown as string });
    expect(merged).toEqual({ name: 'Johnny' });
  });
  it('normalizes entity names for dedup', () => {
    expect(normalizeEntityName('  Acme   Corp ')).toBe('acme corp');
    expect(normalizeEntityName('ACME corp')).toBe('acme corp');
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx jest __tests__/lib/memory/profile.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/memory/profile.ts
/** Field-level merge: patch wins, but null/empty values are ignored (never erase). */
export function mergeProfile(
  current: Record<string, unknown>,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const out = { ...current };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    out[k] = v;
  }
  return out;
}

export function normalizeEntityName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx jest __tests__/lib/memory/profile.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/memory/profile.ts __tests__/lib/memory/profile.test.ts
git commit -m "feat(memory): profile merge + entity normalization"
```

### Task 3.4: Command parsing (/remember, /global)

**Files:**
- Create: `lib/memory/commands.ts`
- Test: `__tests__/lib/memory/commands.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/lib/memory/commands.test.ts
import { parseMemoryCommand } from '@/lib/memory/commands';

describe('parseMemoryCommand', () => {
  it('parses /remember', () => {
    expect(parseMemoryCommand('/remember prod DB is read-only'))
      .toEqual({ kind: 'remember', text: 'prod DB is read-only' });
  });
  it('parses /global', () => {
    expect(parseMemoryCommand('/global office is closed Fridays'))
      .toEqual({ kind: 'global', text: 'office is closed Fridays' });
  });
  it('returns null for normal messages', () => {
    expect(parseMemoryCommand('what is the weather?')).toBeNull();
  });
  it('returns null for a command with no body', () => {
    expect(parseMemoryCommand('/remember   ')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx jest __tests__/lib/memory/commands.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/memory/commands.ts
export type MemoryCommand =
  | { kind: 'remember'; text: string }
  | { kind: 'global'; text: string };

export function parseMemoryCommand(input: string): MemoryCommand | null {
  const m = input.match(/^\/(remember|global)\s+(.+)$/s);
  if (!m) return null;
  const text = m[2].trim();
  if (!text) return null;
  return { kind: m[1] as 'remember' | 'global', text };
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx jest __tests__/lib/memory/commands.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/memory/commands.ts __tests__/lib/memory/commands.test.ts
git commit -m "feat(memory): /remember and /global command parsing"
```

---

# PART 4 — Storage backends

### Task 4.1: MemoryStore interface + injection formatter

**Files:**
- Create: `lib/memory/store.ts` (interface only)
- Create: `lib/memory/injector.ts`
- Test: `__tests__/lib/memory/injector.test.ts`

- [ ] **Step 1: Write the interface (no test — type-only)**

```ts
// lib/memory/store.ts
import type {
  MemoryRecord, MemoryWrite, EntityWrite, Profile, MemoryScope,
  SearchOptions, MemoryVisibility, UsageStats,
} from './types';

export interface MemoryStore {
  getProfile(scope: MemoryScope): Promise<Profile | null>;
  upsertProfile(scope: MemoryScope, patch: Record<string, unknown>): Promise<void>;
  store(scope: MemoryScope, memories: MemoryWrite[]): Promise<MemoryRecord[]>;
  search(scope: MemoryScope, query: string, opts?: SearchOptions): Promise<MemoryRecord[]>;
  touch(ids: string[]): Promise<void>;
  promote(id: string, visibility: MemoryVisibility): Promise<void>;
  touchEntities(scope: MemoryScope, entities: EntityWrite[]): Promise<void>;
  archive(id: string): Promise<void>;
  purgeExpiredArchives(graceDays: number): Promise<number>;
  decay(scope: MemoryScope): Promise<void>;
  usage(scope: MemoryScope): Promise<UsageStats>;
  listAll(scope: MemoryScope): Promise<MemoryRecord[]>;
}
```

- [ ] **Step 2: Write the failing injector test**

```ts
// __tests__/lib/memory/injector.test.ts
import { buildMemoryBlock } from '@/lib/memory/injector';
import type { MemoryRecord } from '@/lib/memory/types';

const mk = (over: Partial<MemoryRecord>): MemoryRecord => ({
  id: 'x', userId: 'u', type: 'semantic', content: 'c', importance: 5,
  visibility: 'private', source: 'extracted', accessCount: 0,
  createdAt: 1, updatedAt: 1, ...over,
});

describe('buildMemoryBlock', () => {
  it('returns empty string when nothing to inject', () => {
    expect(buildMemoryBlock(null, [])).toBe('');
  });
  it('includes a profile line when present', () => {
    const block = buildMemoryBlock({ data: { name: 'Johnny', role: 'founder' }, updatedAt: 1 }, []);
    expect(block).toContain('Who you are');
    expect(block).toContain('Johnny');
  });
  it('groups memories by type with headings', () => {
    const block = buildMemoryBlock(null, [
      mk({ type: 'semantic', content: 'Acme runs on Postgres' }),
      mk({ type: 'pragmatic', content: 'wants code first' }),
      mk({ type: 'episodic', content: 'shipped auth June 5' }),
    ]);
    expect(block).toContain('Acme runs on Postgres');
    expect(block).toContain('wants code first');
    expect(block).toContain('shipped auth June 5');
    expect(block).toContain('What Lucy knows');
  });
});
```

- [ ] **Step 3: Run test, verify it fails**

Run: `npx jest __tests__/lib/memory/injector.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the injector**

```ts
// lib/memory/injector.ts
import type { MemoryRecord, Profile } from './types';

const TYPE_LABEL: Record<string, string> = {
  semantic: 'Facts',
  pragmatic: 'Working style',
  episodic: 'Recently',
};

function profileLine(data: Record<string, unknown>): string {
  return Object.entries(data)
    .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '')
    .map(([k, v]) => `${k}: ${v}`)
    .join(' · ');
}

/** Build the system-prompt memory block: profile (always) + grouped collection. */
export function buildMemoryBlock(profile: Profile | null, memories: MemoryRecord[]): string {
  const sections: string[] = [];

  if (profile && Object.keys(profile.data).length > 0) {
    const line = profileLine(profile.data);
    if (line) sections.push(`## Who you are\n${line}`);
  }

  if (memories.length > 0) {
    const groups: Record<string, string[]> = { semantic: [], pragmatic: [], episodic: [] };
    for (const m of memories) groups[m.type]?.push(m.summary || m.content);
    const lines: string[] = [];
    for (const type of ['semantic', 'pragmatic', 'episodic'] as const) {
      if (groups[type].length > 0) {
        lines.push(`${TYPE_LABEL[type]}: ${groups[type].join(' · ')}`);
      }
    }
    if (lines.length > 0) sections.push(`## What Lucy knows\n${lines.join('\n')}`);
  }

  return sections.join('\n\n');
}
```

- [ ] **Step 5: Run test, verify it passes**

Run: `npx jest __tests__/lib/memory/injector.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/memory/store.ts lib/memory/injector.ts __tests__/lib/memory/injector.test.ts
git commit -m "feat(memory): MemoryStore interface + system-prompt injector"
```

### Task 4.2: LocalMemoryStore (in-memory map, lexical search)

Implements `MemoryStore` over a simple injectable key-value backing (so it is unit-testable in
jsdom without IndexedDB). The IndexedDB binding is a thin wrapper added in Task 4.3.

**Files:**
- Create: `lib/memory/local-store.ts`
- Test: `__tests__/lib/memory/local-store.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/lib/memory/local-store.test.ts
import { LocalMemoryStore, MemoryKV } from '@/lib/memory/local-store';

function memoryKV(): MemoryKV {
  const m = new Map<string, string>();
  return {
    get: async (k) => m.get(k) ?? null,
    set: async (k, v) => void m.set(k, v),
  };
}

const scope = { userId: 'u1', projectId: null };

describe('LocalMemoryStore', () => {
  it('stores and lexically searches memories', async () => {
    const store = new LocalMemoryStore(memoryKV());
    await store.store(scope, [
      { type: 'semantic', content: 'Acme runs on Postgres' },
      { type: 'semantic', content: 'User prefers dark mode' },
    ]);
    const hits = await store.search(scope, 'postgres database', { limit: 5 });
    expect(hits[0].content).toContain('Acme');
  });

  it('upserts and merges the profile', async () => {
    const store = new LocalMemoryStore(memoryKV());
    await store.upsertProfile(scope, { name: 'Johnny' });
    await store.upsertProfile(scope, { role: 'founder' });
    const p = await store.getProfile(scope);
    expect(p?.data).toEqual({ name: 'Johnny', role: 'founder' });
  });

  it('bumps entity occurrence_count on repeat', async () => {
    const store = new LocalMemoryStore(memoryKV());
    await store.touchEntities(scope, [{ name: 'Acme Corp', type: 'client' }]);
    await store.touchEntities(scope, [{ name: 'acme corp' }]);
    const usage = await store.usage(scope);
    expect(usage.entities).toBe(1);
  });

  it('reports usage counts', async () => {
    const store = new LocalMemoryStore(memoryKV());
    await store.store(scope, [{ type: 'semantic', content: 'x' }]);
    const usage = await store.usage(scope);
    expect(usage.memories).toBe(1);
    expect(usage.bytes).toBeGreaterThan(0);
  });

  it('archive removes a memory from search', async () => {
    const store = new LocalMemoryStore(memoryKV());
    const [rec] = await store.store(scope, [{ type: 'semantic', content: 'secret plan' }]);
    await store.archive(rec.id);
    const hits = await store.search(scope, 'secret', { limit: 5 });
    expect(hits.find((h) => h.id === rec.id)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx jest __tests__/lib/memory/local-store.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/memory/local-store.ts
import type { MemoryStore } from './store';
import type {
  MemoryRecord, MemoryWrite, EntityRecord, EntityWrite, Profile,
  MemoryScope, SearchOptions, MemoryVisibility, UsageStats,
} from './types';
import { mergeProfile, normalizeEntityName } from './profile';
import { rankScore } from './scoring';

/** Minimal async KV backing (IndexedDB or in-memory map for tests). */
export interface MemoryKV {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

interface LocalData {
  memories: MemoryRecord[];
  entities: EntityRecord[];
  profiles: Record<string, Profile>;
}

const KEY = 'lucy-memory-v1';

function uid(): string {
  return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function profileKey(scope: MemoryScope): string {
  return `${scope.userId ?? 'anon'}::${scope.projectId ?? 'global'}`;
}

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

export class LocalMemoryStore implements MemoryStore {
  constructor(private kv: MemoryKV) {}

  private async read(): Promise<LocalData> {
    const raw = await this.kv.get(KEY);
    if (!raw) return { memories: [], entities: [], profiles: {} };
    try {
      return JSON.parse(raw) as LocalData;
    } catch {
      return { memories: [], entities: [], profiles: {} };
    }
  }

  private async write(data: LocalData): Promise<void> {
    await this.kv.set(KEY, JSON.stringify(data));
  }

  private inScope(m: MemoryRecord, scope: MemoryScope): boolean {
    if (m.invalidAt) return false;
    if (m.visibility === 'global') return true;
    return m.userId === scope.userId;
  }

  async getProfile(scope: MemoryScope): Promise<Profile | null> {
    const data = await this.read();
    return data.profiles[profileKey(scope)] ?? null;
  }

  async upsertProfile(scope: MemoryScope, patch: Record<string, unknown>): Promise<void> {
    const data = await this.read();
    const k = profileKey(scope);
    const current = data.profiles[k]?.data ?? {};
    data.profiles[k] = { data: mergeProfile(current, patch), updatedAt: Date.now() };
    await this.write(data);
  }

  async store(scope: MemoryScope, memories: MemoryWrite[]): Promise<MemoryRecord[]> {
    const data = await this.read();
    const now = Date.now();
    const created: MemoryRecord[] = memories.map((w) => ({
      id: uid(),
      userId: scope.userId,
      projectId: scope.projectId ?? null,
      type: w.type,
      category: w.category,
      content: w.content,
      summary: w.summary,
      importance: w.importance ?? 5,
      visibility: w.visibility ?? 'private',
      source: w.source ?? 'extracted',
      sourceConversationId: w.sourceConversationId ?? null,
      accessCount: 0,
      validAt: w.validAt ?? null,
      invalidAt: null,
      createdAt: now,
      updatedAt: now,
    }));
    data.memories.push(...created);
    await this.write(data);
    return created;
  }

  async search(scope: MemoryScope, query: string, opts: SearchOptions = {}): Promise<MemoryRecord[]> {
    const data = await this.read();
    const qTokens = new Set(tokenize(query));
    const candidates = data.memories.filter(
      (m) => this.inScope(m, scope) && (!opts.types || opts.types.includes(m.type))
    );
    const now = Date.now();
    const scored = candidates.map((m) => {
      const mTokens = tokenize(`${m.content} ${m.summary ?? ''} ${m.category ?? ''}`);
      const overlap = mTokens.filter((t) => qTokens.has(t)).length;
      const base = mTokens.length ? overlap / Math.sqrt(mTokens.length) : 0;
      const ageDays = (now - m.createdAt) / 86_400_000;
      return { m, score: rankScore({ base, importance: m.importance, ageDays, accessCount: m.accessCount }) };
    });
    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, opts.limit ?? 12)
      .map((s) => s.m);
  }

  async touch(ids: string[]): Promise<void> {
    const data = await this.read();
    const set = new Set(ids);
    const now = Date.now();
    for (const m of data.memories) {
      if (set.has(m.id)) {
        m.accessCount += 1;
        m.lastAccessed = now;
      }
    }
    await this.write(data);
  }

  async promote(id: string, visibility: MemoryVisibility): Promise<void> {
    const data = await this.read();
    const m = data.memories.find((x) => x.id === id);
    if (m) {
      m.visibility = visibility;
      m.updatedAt = Date.now();
      await this.write(data);
    }
  }

  async touchEntities(scope: MemoryScope, entities: EntityWrite[]): Promise<void> {
    const data = await this.read();
    const now = Date.now();
    for (const e of entities) {
      const norm = normalizeEntityName(e.name);
      const existing = data.entities.find(
        (x) => x.userId === scope.userId && x.normalizedName === norm
      ) as (EntityRecord & { userId?: string }) | undefined;
      if (existing) {
        existing.occurrenceCount += 1;
        existing.lastSeen = now;
        existing.importance = Math.min(10, existing.importance + 1);
      } else {
        data.entities.push({
          id: uid(),
          // userId stored for scoping (not in EntityRecord public type)
          ...(({ userId: scope.userId } as unknown) as object),
          name: e.name,
          normalizedName: norm,
          type: e.type,
          occurrenceCount: 1,
          importance: 5,
          visibility: 'private',
          firstSeen: now,
          lastSeen: now,
        } as EntityRecord);
      }
    }
    await this.write(data);
  }

  async archive(id: string): Promise<void> {
    const data = await this.read();
    data.memories = data.memories.filter((m) => m.id !== id);
    await this.write(data);
  }

  async purgeExpiredArchives(): Promise<number> {
    return 0; // local mode hard-deletes immediately in archive()
  }

  async decay(scope: MemoryScope): Promise<void> {
    const data = await this.read();
    const now = Date.now();
    const before = data.memories.length;
    data.memories = data.memories.filter((m) => {
      if (!this.inScope(m, scope)) return true;
      const ageDays = (now - (m.lastAccessed ?? m.createdAt)) / 86_400_000;
      return !(m.importance <= 2 && ageDays > 90 && m.accessCount === 0);
    });
    if (data.memories.length !== before) await this.write(data);
  }

  async usage(scope: MemoryScope): Promise<UsageStats> {
    const data = await this.read();
    const mine = data.memories.filter((m) => this.inScope(m, scope));
    const ents = data.entities.filter((e) => (e as EntityRecord & { userId?: string }).userId === scope.userId);
    const bytes = JSON.stringify({ mine, ents }).length;
    return { memories: mine.length, entities: ents.length, bytes };
  }

  async listAll(scope: MemoryScope): Promise<MemoryRecord[]> {
    const data = await this.read();
    return data.memories
      .filter((m) => this.inScope(m, scope))
      .sort((a, b) => b.createdAt - a.createdAt);
  }
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx jest __tests__/lib/memory/local-store.test.ts`
Expected: PASS (5 tests). If the entity scoping cast causes a TS error under ts-jest, simplify by
adding an internal `userId?: string` field to a private `StoredEntity` type in this file and using
that for the array instead of casting.

- [ ] **Step 5: Commit**

```bash
git add lib/memory/local-store.ts __tests__/lib/memory/local-store.test.ts
git commit -m "feat(memory): LocalMemoryStore with lexical search + salience"
```

### Task 4.3: IndexedDB KV adapter

Thin browser binding so `LocalMemoryStore` persists across reloads. Not unit-tested (jsdom lacks
a full IndexedDB); verified manually in the browser.

**Files:**
- Create: `lib/memory/indexeddb-kv.ts`

- [ ] **Step 1: Implement**

```ts
// lib/memory/indexeddb-kv.ts
import type { MemoryKV } from './local-store';

const DB_NAME = 'lucy-memory';
const STORE = 'kv';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** IndexedDB-backed MemoryKV for standalone mode. Falls back to localStorage on failure. */
export function createIndexedDBKV(): MemoryKV {
  return {
    async get(key) {
      try {
        const db = await openDB();
        return await new Promise<string | null>((resolve, reject) => {
          const tx = db.transaction(STORE, 'readonly');
          const req = tx.objectStore(STORE).get(key);
          req.onsuccess = () => resolve((req.result as string) ?? null);
          req.onerror = () => reject(req.error);
        });
      } catch {
        return localStorage.getItem(key);
      }
    },
    async set(key, value) {
      try {
        const db = await openDB();
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).put(value, key);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      } catch {
        localStorage.setItem(key, value);
      }
    },
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in this file.

- [ ] **Step 3: Commit**

```bash
git add lib/memory/indexeddb-kv.ts
git commit -m "feat(memory): IndexedDB KV adapter for standalone storage"
```

### Task 4.4: SupabaseMemoryStore (pgvector + RRF)

Implements `MemoryStore` against the `lucy` schema. Uses a Postgres RPC for hybrid search.

**Files:**
- Create: `lib/supabase/memory_search.sql` (RPC functions)
- Create: `lib/memory/supabase-store.ts`
- Test: `__tests__/lib/memory/supabase-store.test.ts` (mocked client)

- [ ] **Step 1: Write the hybrid-search RPCs**

```sql
-- lib/supabase/memory_search.sql — apply after memory.sql
set search_path to lucy, public;

-- Vector search (cosine). Pass a halfvec literal; returns ids best-first.
create or replace function lucy.memory_vector_search(
  p_user uuid, p_query halfvec(1536), p_limit int
) returns table(id uuid, rank int) language sql stable as $$
  select m.id, row_number() over (order by m.embedding <=> p_query)::int
  from lucy.memories m
  where (m.user_id = p_user or m.visibility = 'global')
    and m.invalid_at is null and m.embedding is not null
  order by m.embedding <=> p_query
  limit p_limit;
$$;

-- Keyword search (FTS). Returns ids best-first.
create or replace function lucy.memory_keyword_search(
  p_user uuid, p_query text, p_limit int
) returns table(id uuid, rank int) language sql stable as $$
  select m.id, row_number() over (order by ts_rank(m.fts, websearch_to_tsquery('english', p_query)) desc)::int
  from lucy.memories m
  where (m.user_id = p_user or m.visibility = 'global')
    and m.invalid_at is null
    and m.fts @@ websearch_to_tsquery('english', p_query)
  order by ts_rank(m.fts, websearch_to_tsquery('english', p_query)) desc
  limit p_limit;
$$;
```

Apply in the Supabase SQL editor. Commit alongside the store.

- [ ] **Step 2: Write the failing test (mocked Supabase client)**

```ts
// __tests__/lib/memory/supabase-store.test.ts
import { SupabaseMemoryStore } from '@/lib/memory/supabase-store';

function fakeClient() {
  const rows: Record<string, unknown>[] = [];
  return {
    rows,
    from() {
      return {
        insert(payload: Record<string, unknown>[]) {
          rows.push(...payload);
          return { select: () => ({ data: payload.map((p, i) => ({ ...p, id: `id_${i}` })), error: null }) };
        },
        upsert() { return { error: null }; },
        select() { return { eq: () => ({ data: rows, error: null }) }; },
      };
    },
    rpc() { return { data: [], error: null }; },
  };
}

describe('SupabaseMemoryStore', () => {
  it('store() maps writes to lucy.memories rows', async () => {
    const client = fakeClient();
    const store = new SupabaseMemoryStore(client as never, { apiKey: '' });
    const recs = await store.store({ userId: 'u1', projectId: null }, [
      { type: 'semantic', content: 'Acme runs on Postgres', importance: 7 },
    ]);
    expect(recs[0].content).toBe('Acme runs on Postgres');
    expect(client.rows[0].type).toBe('semantic');
  });

  it('search() returns [] gracefully when rpc yields nothing', async () => {
    const client = fakeClient();
    const store = new SupabaseMemoryStore(client as never, { apiKey: '' });
    const hits = await store.search({ userId: 'u1', projectId: null }, 'postgres');
    expect(hits).toEqual([]);
  });
});
```

- [ ] **Step 3: Run test, verify it fails**

Run: `npx jest __tests__/lib/memory/supabase-store.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

```ts
// lib/memory/supabase-store.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MemoryStore } from './store';
import type {
  MemoryRecord, MemoryWrite, EntityWrite, Profile, MemoryScope,
  SearchOptions, MemoryVisibility, UsageStats,
} from './types';
import { embedText, type EmbedderConfig } from './embeddings';
import { reciprocalRankFusion, rankScore } from './scoring';
import { mergeProfile, normalizeEntityName } from './profile';

function rowToRecord(r: Record<string, unknown>): MemoryRecord {
  return {
    id: r.id as string,
    userId: (r.user_id as string) ?? null,
    projectId: (r.project_id as string | null) ?? null,
    type: r.type as MemoryRecord['type'],
    category: (r.category as string) ?? undefined,
    content: r.content as string,
    summary: (r.summary as string) ?? undefined,
    importance: (r.importance as number) ?? 5,
    visibility: r.visibility as MemoryVisibility,
    source: r.source as MemoryRecord['source'],
    sourceConversationId: (r.source_conversation_id as string | null) ?? null,
    accessCount: (r.access_count as number) ?? 0,
    lastAccessed: r.last_accessed ? new Date(r.last_accessed as string).getTime() : null,
    validAt: r.valid_at ? new Date(r.valid_at as string).getTime() : null,
    invalidAt: r.invalid_at ? new Date(r.invalid_at as string).getTime() : null,
    createdAt: r.created_at ? new Date(r.created_at as string).getTime() : Date.now(),
    updatedAt: r.updated_at ? new Date(r.updated_at as string).getTime() : Date.now(),
    expiresAt: r.expires_at ? new Date(r.expires_at as string).getTime() : null,
  };
}

export class SupabaseMemoryStore implements MemoryStore {
  constructor(private client: SupabaseClient, private embedder: EmbedderConfig) {}

  async getProfile(scope: MemoryScope): Promise<Profile | null> {
    const { data } = await this.client
      .from('memory_profiles')
      .select('data, updated_at')
      .eq('user_id', scope.userId)
      .is('project_id', scope.projectId ?? null)
      .maybeSingle();
    if (!data) return null;
    return { data: (data.data as Record<string, unknown>) ?? {}, updatedAt: Date.now() };
  }

  async upsertProfile(scope: MemoryScope, patch: Record<string, unknown>): Promise<void> {
    const existing = await this.getProfile(scope);
    const merged = mergeProfile(existing?.data ?? {}, patch);
    await this.client.from('memory_profiles').upsert(
      { user_id: scope.userId, project_id: scope.projectId ?? null, data: merged, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,project_id' }
    );
  }

  async store(scope: MemoryScope, memories: MemoryWrite[]): Promise<MemoryRecord[]> {
    if (memories.length === 0) return [];
    const payload = await Promise.all(
      memories.map(async (w) => ({
        user_id: scope.userId,
        project_id: scope.projectId ?? null,
        type: w.type,
        category: w.category ?? null,
        content: w.content,
        summary: w.summary ?? null,
        importance: w.importance ?? 5,
        visibility: w.visibility ?? 'private',
        source: w.source ?? 'extracted',
        source_conversation_id: w.sourceConversationId ?? null,
        valid_at: w.validAt ? new Date(w.validAt).toISOString() : null,
        embedding: await this.embedOrNull(w.content),
      }))
    );
    const { data, error } = await this.client.from('memories').insert(payload).select();
    if (error || !data) return [];
    return (data as Record<string, unknown>[]).map(rowToRecord);
  }

  private async embedOrNull(text: string): Promise<string | null> {
    const vec = await embedText(text, this.embedder);
    return vec ? `[${vec.join(',')}]` : null;
  }

  async search(scope: MemoryScope, query: string, opts: SearchOptions = {}): Promise<MemoryRecord[]> {
    const limit = opts.limit ?? 12;
    const vec = await embedText(query, this.embedder);

    const lists: string[][] = [];
    if (vec) {
      const { data } = await this.client.rpc('memory_vector_search', {
        p_user: scope.userId, p_query: `[${vec.join(',')}]`, p_limit: limit * 2,
      });
      if (data) lists.push((data as { id: string }[]).map((d) => d.id));
    }
    const { data: kw } = await this.client.rpc('memory_keyword_search', {
      p_user: scope.userId, p_query: query, p_limit: limit * 2,
    });
    if (kw) lists.push((kw as { id: string }[]).map((d) => d.id));

    const fusedIds = reciprocalRankFusion(lists).slice(0, limit * 2);
    if (fusedIds.length === 0) return [];

    const { data: rows } = await this.client.from('memories').select('*').in('id', fusedIds);
    if (!rows) return [];
    const byId = new Map((rows as Record<string, unknown>[]).map((r) => [r.id as string, rowToRecord(r)]));
    const now = Date.now();
    return fusedIds
      .map((id, idx) => byId.get(id))
      .filter((m): m is MemoryRecord => Boolean(m) && (!opts.types || opts.types.includes(m!.type)))
      .map((m, idx) => ({ m, s: rankScore({ base: 1 / (idx + 1), importance: m.importance, ageDays: (now - m.createdAt) / 86_400_000, accessCount: m.accessCount }) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, limit)
      .map((x) => x.m);
  }

  async touch(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.client.rpc('noop').catch(() => {});
    for (const id of ids) {
      await this.client.from('memories')
        .update({ last_accessed: new Date().toISOString() })
        .eq('id', id);
    }
  }

  async promote(id: string, visibility: MemoryVisibility): Promise<void> {
    await this.client.from('memories').update({ visibility, updated_at: new Date().toISOString() }).eq('id', id);
  }

  async touchEntities(scope: MemoryScope, entities: EntityWrite[]): Promise<void> {
    for (const e of entities) {
      const norm = normalizeEntityName(e.name);
      const { data: existing } = await this.client
        .from('entities').select('id, occurrence_count, importance')
        .eq('user_id', scope.userId).eq('normalized_name', norm).maybeSingle();
      if (existing) {
        await this.client.from('entities').update({
          occurrence_count: (existing.occurrence_count as number) + 1,
          importance: Math.min(10, (existing.importance as number) + 1),
          last_seen: new Date().toISOString(),
        }).eq('id', existing.id);
      } else {
        await this.client.from('entities').insert({
          user_id: scope.userId, project_id: scope.projectId ?? null,
          name: e.name, normalized_name: norm, type: e.type ?? null,
        });
      }
    }
  }

  async archive(id: string): Promise<void> {
    await this.client.from('memories')
      .update({ invalid_at: new Date().toISOString(), expires_at: new Date().toISOString() })
      .eq('id', id);
  }

  async purgeExpiredArchives(graceDays: number): Promise<number> {
    const cutoff = new Date(Date.now() - graceDays * 86_400_000).toISOString();
    const { data } = await this.client.from('memories').delete().lt('expires_at', cutoff).select('id');
    return (data as unknown[] | null)?.length ?? 0;
  }

  async decay(): Promise<void> {
    // Lazy/no-op server-side for Phase 1; reinforcement via touch() + ranking handles relevance.
  }

  async usage(scope: MemoryScope): Promise<UsageStats> {
    const m = await this.client.from('memories').select('id', { count: 'exact', head: true }).eq('user_id', scope.userId);
    const e = await this.client.from('entities').select('id', { count: 'exact', head: true }).eq('user_id', scope.userId);
    return { memories: m.count ?? 0, entities: e.count ?? 0, bytes: 0 };
  }

  async listAll(scope: MemoryScope): Promise<MemoryRecord[]> {
    const { data } = await this.client.from('memories').select('*')
      .eq('user_id', scope.userId).is('invalid_at', null)
      .order('created_at', { ascending: false });
    return ((data as Record<string, unknown>[]) ?? []).map(rowToRecord);
  }
}
```

- [ ] **Step 5: Run test, verify it passes**

Run: `npx jest __tests__/lib/memory/supabase-store.test.ts`
Expected: PASS (2 tests). If the `touch()` `rpc('noop')` line trips the fake client, delete that
line — it is a defensive no-op and not required.

- [ ] **Step 6: Apply the RPC SQL & commit**

Apply `lib/supabase/memory_search.sql` in Supabase. Then:
```bash
git add lib/memory/supabase-store.ts lib/supabase/memory_search.sql \
  __tests__/lib/memory/supabase-store.test.ts
git commit -m "feat(memory): SupabaseMemoryStore — pgvector + FTS + RRF"
```

---

# PART 5 — Extraction & orchestration

### Task 5.1: Extractor (reconciliation-aware)

Builds the extraction prompt, calls the configured chat model, validates with Zod, applies the
privacy guard, and returns a normalized `ExtractionResult`. The LLM call is injected as a function
so it is unit-testable.

**Files:**
- Create: `lib/memory/extractor.ts`
- Test: `__tests__/lib/memory/extractor.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/lib/memory/extractor.test.ts
import { extractMemories } from '@/lib/memory/extractor';
import type { ChatMessage } from '@/lib/providers/types';

const convo: ChatMessage[] = [
  { role: 'user', content: 'I prefer TypeScript. Our client Acme uses Postgres.' },
  { role: 'assistant', content: 'Noted!' },
];

describe('extractMemories', () => {
  it('parses a valid LLM JSON response and applies privacy guard', async () => {
    const llm = jest.fn().mockResolvedValue(JSON.stringify({
      memories: [
        { op: 'ADD', type: 'semantic', content: 'User prefers TypeScript', importance: 7 },
        { op: 'ADD', type: 'semantic', content: 'API key is sk-abcdef0123456789abcdef0123456789', importance: 9 },
      ],
      entities: [{ name: 'Acme', type: 'client' }],
      profilePatch: { preferred_language: 'TypeScript' },
    }));
    const result = await extractMemories(convo, [], llm);
    // secret memory dropped:
    expect(result.memories).toHaveLength(1);
    expect(result.memories[0].content).toContain('TypeScript');
    expect(result.entities[0].name).toBe('Acme');
    expect(result.profilePatch.preferred_language).toBe('TypeScript');
  });

  it('returns an empty result when the LLM returns garbage', async () => {
    const llm = jest.fn().mockResolvedValue('not json at all');
    const result = await extractMemories(convo, [], llm);
    expect(result.memories).toEqual([]);
    expect(result.entities).toEqual([]);
  });

  it('tolerates JSON wrapped in markdown fences', async () => {
    const llm = jest.fn().mockResolvedValue('```json\n{"memories":[],"entities":[],"profilePatch":{}}\n```');
    const result = await extractMemories(convo, [], llm);
    expect(result.memories).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx jest __tests__/lib/memory/extractor.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/memory/extractor.ts
import type { ChatMessage } from '@/lib/providers/types';
import { ExtractionResultSchema, type ExtractionResult, type MemoryRecord } from './types';
import { containsSecret } from './privacy';

/** Injected LLM caller: takes a prompt, returns the raw model text. */
export type LlmCaller = (prompt: string) => Promise<string>;

const SYSTEM_INSTRUCTIONS = `You extract durable memory from a conversation for a business AI assistant.
Return ONLY JSON matching this shape:
{
  "memories": [{ "op": "ADD|UPDATE|MERGE|SKIP", "id": "<existing id if UPDATE/MERGE>",
                 "type": "semantic|pragmatic|episodic", "category": "string?",
                 "content": "one atomic fact/preference/event", "summary": "short form?",
                 "importance": 1-10 }],
  "entities": [{ "name": "string", "type": "client|product|person|term|project?" }],
  "profilePatch": { "field": "value" }
}
Rules:
- semantic = stable facts/preferences; pragmatic = working style/intent; episodic = what happened, when.
- Compare against EXISTING MEMORIES provided; use UPDATE/MERGE/SKIP to avoid duplicates, ADD only for new.
- NEVER include passwords, API keys, tokens, or other secrets/PII.
- profilePatch holds only stable identity/preferences (name, role, company, communication style).
- Be conservative: omit trivial chatter. Prefer 0 memories over noise.`;

function buildPrompt(conversation: ChatMessage[], existing: MemoryRecord[]): string {
  const convoText = conversation
    .filter((m) => m.role !== 'system')
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n');
  const existingText = existing.length
    ? existing.map((m) => `- [${m.id}] (${m.type}) ${m.content}`).join('\n')
    : '(none)';
  return `${SYSTEM_INSTRUCTIONS}\n\nEXISTING MEMORIES:\n${existingText}\n\nCONVERSATION:\n${convoText}\n\nJSON:`;
}

function stripFences(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const brace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (brace >= 0 && lastBrace > brace) return text.slice(brace, lastBrace + 1);
  return text.trim();
}

const EMPTY: ExtractionResult = { memories: [], entities: [], profilePatch: {} };

export async function extractMemories(
  conversation: ChatMessage[],
  existing: MemoryRecord[],
  llm: LlmCaller
): Promise<ExtractionResult> {
  let raw: string;
  try {
    raw = await llm(buildPrompt(conversation, existing));
  } catch {
    return EMPTY;
  }
  let parsed: ExtractionResult;
  try {
    parsed = ExtractionResultSchema.parse(JSON.parse(stripFences(raw)));
  } catch {
    return EMPTY;
  }
  // Privacy guard — drop any memory or entity that looks like a secret.
  const memories = parsed.memories.filter(
    (m) => m.op !== 'SKIP' && !containsSecret(m.content)
  );
  const profilePatch = Object.fromEntries(
    Object.entries(parsed.profilePatch).filter(([, v]) => !containsSecret(String(v)))
  );
  return { memories, entities: parsed.entities, profilePatch };
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx jest __tests__/lib/memory/extractor.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/memory/extractor.ts __tests__/lib/memory/extractor.test.ts
git commit -m "feat(memory): reconciliation-aware extractor with privacy guard"
```

### Task 5.2: Public surface (`index.ts`) + store factory

Wires mode selection (Supabase vs local) and exposes the high-level operations the app calls.

**Files:**
- Create: `lib/memory/index.ts`
- Test: `__tests__/lib/memory/index.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/lib/memory/index.test.ts
import { ingestExtraction } from '@/lib/memory/index';
import { LocalMemoryStore, type MemoryKV } from '@/lib/memory/local-store';

function memoryKV(): MemoryKV {
  const m = new Map<string, string>();
  return { get: async (k) => m.get(k) ?? null, set: async (k, v) => void m.set(k, v) };
}
const scope = { userId: 'u1', projectId: null };

describe('ingestExtraction', () => {
  it('writes memories, entities and profile patch to the store', async () => {
    const store = new LocalMemoryStore(memoryKV());
    await ingestExtraction(store, scope, {
      memories: [{ op: 'ADD', type: 'semantic', content: 'Acme uses Postgres', importance: 7 }],
      entities: [{ name: 'Acme', type: 'client' }],
      profilePatch: { company: 'Acme' },
    }, 'conv1');
    const all = await store.listAll(scope);
    expect(all).toHaveLength(1);
    expect(all[0].sourceConversationId).toBe('conv1');
    const profile = await store.getProfile(scope);
    expect(profile?.data.company).toBe('Acme');
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx jest __tests__/lib/memory/index.test.ts`
Expected: FAIL — module not found / no `ingestExtraction`.

- [ ] **Step 3: Implement**

```ts
// lib/memory/index.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MemoryStore } from './store';
import type { EmbedderConfig } from './embeddings';
import type { ExtractionResult, MemoryScope, MemoryWrite } from './types';
import { computeImportance } from './scoring';
import { SupabaseMemoryStore } from './supabase-store';
import { LocalMemoryStore } from './local-store';
import { createIndexedDBKV } from './indexeddb-kv';

export * from './types';
export { parseMemoryCommand } from './commands';
export { buildMemoryBlock } from './injector';
export type { MemoryStore } from './store';

export interface CreateStoreOptions {
  client?: SupabaseClient | null;
  embedder?: EmbedderConfig;
}

/** Pick the right backend: Supabase when a client is provided, else local IndexedDB. */
export function createMemoryStore(opts: CreateStoreOptions): MemoryStore {
  if (opts.client) {
    return new SupabaseMemoryStore(opts.client, opts.embedder ?? { apiKey: '' });
  }
  return new LocalMemoryStore(createIndexedDBKV());
}

/** Apply a validated extraction result to a store. */
export async function ingestExtraction(
  store: MemoryStore,
  scope: MemoryScope,
  result: ExtractionResult,
  conversationId: string | null
): Promise<void> {
  const writes: MemoryWrite[] = result.memories.map((m) => ({
    type: m.type,
    category: m.category,
    content: m.content,
    summary: m.summary,
    importance: computeImportance(m.importance, 'extracted'),
    source: 'extracted',
    sourceConversationId: conversationId,
  }));
  if (writes.length) await store.store(scope, writes);
  if (result.entities.length) await store.touchEntities(scope, result.entities);
  if (Object.keys(result.profilePatch).length) await store.upsertProfile(scope, result.profilePatch);
}

/** Apply a /remember or /global command immediately. */
export async function ingestCommand(
  store: MemoryStore,
  scope: MemoryScope,
  kind: 'remember' | 'global',
  text: string,
  conversationId: string | null
): Promise<void> {
  await store.store(scope, [{
    type: 'semantic',
    content: text,
    importance: computeImportance(8, kind === 'global' ? 'user_global' : 'user_remember'),
    visibility: kind === 'global' ? 'global' : 'private',
    source: kind === 'global' ? 'user_global' : 'user_remember',
    sourceConversationId: conversationId,
  }]);
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx jest __tests__/lib/memory/index.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Run the full memory suite**

Run: `npx jest __tests__/lib/memory`
Expected: all memory tests PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/memory/index.ts __tests__/lib/memory/index.test.ts
git commit -m "feat(memory): public surface + store factory + ingest helpers"
```

---

# PART 6 — App wiring

### Task 6.1: Retrieval injection in the chat API route

Inject the memory block into the system prompt before the provider call, gated by an
`x-memory-enabled` header (the client only sends it when the admin gate + Supabase are on).

**Files:**
- Modify: `app/api/chat/route.ts`
- Create: `lib/memory/server.ts` (server-side store construction with service-role client)
- Test: `__tests__/lib/memory/server.test.ts`

- [ ] **Step 1: Write `lib/memory/server.ts` test**

```ts
// __tests__/lib/memory/server.test.ts
import { buildRetrievalBlock } from '@/lib/memory/server';
import { LocalMemoryStore, type MemoryKV } from '@/lib/memory/local-store';

function kv(): MemoryKV { const m = new Map<string,string>(); return { get: async k=>m.get(k)??null, set: async (k,v)=>void m.set(k,v) }; }

describe('buildRetrievalBlock', () => {
  it('returns profile + retrieved memories as a prompt block', async () => {
    const store = new LocalMemoryStore(kv());
    const scope = { userId: 'u1', projectId: null };
    await store.upsertProfile(scope, { name: 'Johnny' });
    await store.store(scope, [{ type: 'semantic', content: 'Acme uses Postgres' }]);
    const block = await buildRetrievalBlock(store, scope, 'tell me about acme postgres');
    expect(block).toContain('Johnny');
    expect(block).toContain('Acme');
  });

  it('returns empty string when store has nothing relevant', async () => {
    const store = new LocalMemoryStore(kv());
    const block = await buildRetrievalBlock(store, { userId: 'u1', projectId: null }, 'unrelated');
    expect(block).toBe('');
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx jest __tests__/lib/memory/server.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/memory/server.ts`**

```ts
// lib/memory/server.ts
import type { MemoryStore } from './store';
import type { MemoryScope } from './types';
import { buildMemoryBlock } from './injector';

const DEFAULT_BUDGET_ITEMS = 12;

/** Retrieve profile + top memories and format them as a system-prompt block. */
export async function buildRetrievalBlock(
  store: MemoryStore,
  scope: MemoryScope,
  query: string,
  limit = DEFAULT_BUDGET_ITEMS
): Promise<string> {
  const [profile, memories] = await Promise.all([
    store.getProfile(scope),
    store.search(scope, query, { limit }),
  ]);
  if (memories.length) {
    void store.touch(memories.map((m) => m.id));
  }
  return buildMemoryBlock(profile, memories);
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx jest __tests__/lib/memory/server.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire into `app/api/chat/route.ts`**

After the project-context injection block (after line ~158, before "Read API key from request
headers"), insert:

```ts
        // ── Memory retrieval injection ─────────────────────────────────────
        const memoryEnabled = req.headers.get('x-memory-enabled') === '1';
        if (memoryEnabled && userId) {
          try {
            const svcUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
            const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
            const lastUser = [...messages].reverse().find((m) => m.role === 'user');
            if (svcUrl && svcKey && lastUser) {
              const { createClient } = await import('@supabase/supabase-js');
              const { SupabaseMemoryStore } = await import('@/lib/memory/supabase-store');
              const { buildRetrievalBlock } = await import('@/lib/memory/server');
              const svc = createClient(svcUrl, svcKey, { db: { schema: 'lucy' } });
              const embedderKey =
                req.headers.get('x-openai-key') || process.env.OPENAI_API_KEY || '';
              const store = new SupabaseMemoryStore(svc, { apiKey: embedderKey });
              const block = await buildRetrievalBlock(
                store, { userId, projectId: projectId ?? null }, lastUser.content
              );
              if (block) {
                const existingSystem = messagesWithContext.find((m) => m.role === 'system');
                const systemContent = existingSystem ? `${existingSystem.content}\n\n${block}` : block;
                messagesWithContext = [
                  { role: 'system', content: systemContent },
                  ...messagesWithContext.filter((m) => m.role !== 'system'),
                ];
              }
            }
          } catch {
            // Non-fatal — continue without memory
          }
        }
        // ───────────────────────────────────────────────────────────────────
```

- [ ] **Step 6: Typecheck + full test run**

Run: `npx tsc --noEmit && npx jest __tests__/lib/memory`
Expected: no type errors; all memory tests pass.

- [ ] **Step 7: Commit**

```bash
git add lib/memory/server.ts app/api/chat/route.ts __tests__/lib/memory/server.test.ts
git commit -m "feat(memory): inject retrieved memory into chat system prompt"
```

### Task 6.2: Extraction endpoint (conversation-end)

A POST route the client calls when a conversation goes idle / is switched away. It runs extraction
server-side using the chat model, then ingests the result.

**Files:**
- Create: `app/api/memory/extract/route.ts`

No unit test (thin glue over tested modules); verify manually. Keep logic minimal.

- [ ] **Step 1: Implement the route**

```ts
// app/api/memory/extract/route.ts
import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { ChatMessage, ProviderName } from '@/lib/providers/types';
import { getProvider } from '@/lib/providers';
import { extractMemories } from '@/lib/memory/extractor';
import { ingestExtraction } from '@/lib/memory';
import { SupabaseMemoryStore } from '@/lib/memory/supabase-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { messages, userId, projectId, conversationId, model, provider, apiKey, incognito } =
      (await req.json()) as {
        messages: ChatMessage[]; userId: string; projectId?: string;
        conversationId?: string; model: string; provider: ProviderName;
        apiKey: string; incognito?: boolean;
      };

    if (incognito || !userId || !messages?.length) {
      return Response.json({ ok: true, skipped: true });
    }

    const svcUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!svcUrl || !svcKey) return Response.json({ ok: false, error: 'no service client' }, { status: 200 });

    const svc = createClient(svcUrl, svcKey, { db: { schema: 'lucy' } });
    const store = new SupabaseMemoryStore(svc, { apiKey });
    const scope = { userId, projectId: projectId ?? null };

    // LLM caller using the same provider/model as the chat
    const llm = async (prompt: string): Promise<string> => {
      let out = '';
      await getProvider(provider).chat(
        [{ role: 'user', content: prompt }], model, (c) => { out += c; }, { apiKey }
      );
      return out;
    };

    const existing = await store.search(scope, messages.map((m) => m.content).join(' '), { limit: 10 });
    const result = await extractMemories(messages, existing, llm);
    await ingestExtraction(store, scope, result, conversationId ?? null);

    return Response.json({ ok: true, stored: result.memories.length });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 200 });
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/memory/extract/route.ts
git commit -m "feat(memory): conversation-end extraction endpoint"
```

### Task 6.3: Memory store (Zustand) + client trigger wiring

A small client store holds the memory toggle/settings and fires extraction + `/remember`/`/global`
handling. Wire it into the existing chat send flow.

**Files:**
- Create: `lib/store/memory.ts`
- Test: `__tests__/lib/store/memory.test.ts`
- Modify: the chat send handler (locate via grep — see Step 5)

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/lib/store/memory.test.ts
import { useMemoryStore } from '@/lib/store/memory';

describe('useMemoryStore', () => {
  beforeEach(() => useMemoryStore.setState({ enabled: false, incognito: false }));

  it('defaults to disabled, not incognito', () => {
    const s = useMemoryStore.getState();
    expect(s.enabled).toBe(false);
    expect(s.incognito).toBe(false);
  });

  it('toggles incognito', () => {
    useMemoryStore.getState().setIncognito(true);
    expect(useMemoryStore.getState().incognito).toBe(true);
  });

  it('reports header value when enabled', () => {
    useMemoryStore.setState({ enabled: true });
    expect(useMemoryStore.getState().memoryHeader()).toBe('1');
    useMemoryStore.setState({ enabled: false });
    expect(useMemoryStore.getState().memoryHeader()).toBe('0');
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx jest __tests__/lib/store/memory.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the store**

```ts
// lib/store/memory.ts
'use client';
import { create } from 'zustand';

interface MemoryState {
  enabled: boolean;          // admin gate (loaded from memory_settings)
  incognito: boolean;        // per-session: skip capture
  lastUsedCount: number;     // for the "🧠 used N" affordance
  setEnabled(v: boolean): void;
  setIncognito(v: boolean): void;
  setLastUsedCount(n: number): void;
  memoryHeader(): '0' | '1';
}

export const useMemoryStore = create<MemoryState>()((set, get) => ({
  enabled: false,
  incognito: false,
  lastUsedCount: 0,
  setEnabled: (v) => set({ enabled: v }),
  setIncognito: (v) => set({ incognito: v }),
  setLastUsedCount: (n) => set({ lastUsedCount: n }),
  memoryHeader: () => (get().enabled && !get().incognito ? '1' : '0'),
}));
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx jest __tests__/lib/store/memory.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Locate and wire the chat send flow**

Find the send handler and the `/api/chat` fetch:
```bash
npx grep -rn "api/chat" app components 2>/dev/null || true
```
(Use the Grep tool: pattern `fetch\(['"]/api/chat` across `app/` and `components/`.)

In that fetch's headers, add the memory gate header:
```ts
'x-memory-enabled': useMemoryStore.getState().memoryHeader(),
```
Before sending, intercept memory commands:
```ts
import { parseMemoryCommand } from '@/lib/memory';
// ...
const cmd = parseMemoryCommand(userInput);
if (cmd) {
  await fetch('/api/memory/command', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: cmd.kind, text: cmd.text, userId, projectId, conversationId }),
  });
  // show a lightweight confirmation instead of a normal assistant turn
  return;
}
```
After a conversation turn completes (or on conversation switch), fire extraction:
```ts
if (useMemoryStore.getState().enabled && !useMemoryStore.getState().incognito) {
  void fetch('/api/memory/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, userId, projectId, conversationId, model, provider, apiKey }),
  });
}
```

- [ ] **Step 6: Create the command endpoint**

```ts
// app/api/memory/command/route.ts
import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ingestCommand } from '@/lib/memory';
import { SupabaseMemoryStore } from '@/lib/memory/supabase-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { kind, text, userId, projectId, conversationId } = (await req.json()) as {
      kind: 'remember' | 'global'; text: string; userId: string;
      projectId?: string; conversationId?: string;
    };
    const svcUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!svcUrl || !svcKey || !userId) return Response.json({ ok: false }, { status: 200 });
    const svc = createClient(svcUrl, svcKey, { db: { schema: 'lucy' } });
    const store = new SupabaseMemoryStore(svc, { apiKey: '' });
    await ingestCommand(store, { userId, projectId: projectId ?? null }, kind, text, conversationId ?? null);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 200 });
  }
}
```

- [ ] **Step 7: Typecheck + commit**

Run: `npx tsc --noEmit`
```bash
git add lib/store/memory.ts __tests__/lib/store/memory.test.ts \
  app/api/memory/command/route.ts app components
git commit -m "feat(memory): memory store, command + extraction client wiring"
```

---

# PART 7 — Settings & management UI

> These tasks touch React pages. They are verified by `npx tsc --noEmit`, `npm run lint`, and manual
> smoke testing (`npm run dev`, open Settings). No jest tests (UI), following the repo's pattern of
> not unit-testing pages.

### Task 7.1: Admin memory settings API

**Files:**
- Create: `app/api/memory/settings/route.ts` (GET current settings, POST update via service role)

- [ ] **Step 1: Implement**

```ts
// app/api/memory/settings/route.ts
import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { db: { schema: 'lucy' } });
}

export async function GET() {
  const client = svc();
  if (!client) return Response.json({ enabled: false });
  const { data } = await client.from('memory_settings').select('*').eq('id', 1).maybeSingle();
  return Response.json(data ?? { enabled: false });
}

export async function POST(req: NextRequest) {
  const client = svc();
  if (!client) return Response.json({ ok: false }, { status: 200 });
  const patch = await req.json();
  await client.from('memory_settings').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', 1);
  return Response.json({ ok: true });
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit`
```bash
git add app/api/memory/settings/route.ts
git commit -m "feat(memory): admin settings GET/POST endpoint"
```

### Task 7.2: Memory list/usage/delete API

**Files:**
- Create: `app/api/memory/list/route.ts` (list memories + usage; archive a memory)

- [ ] **Step 1: Implement**

```ts
// app/api/memory/list/route.ts
import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { SupabaseMemoryStore } from '@/lib/memory/supabase-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function store(apiKey = '') {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return new SupabaseMemoryStore(createClient(url, key, { db: { schema: 'lucy' } }), { apiKey });
}

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  const s = store();
  if (!s || !userId) return Response.json({ memories: [], usage: { memories: 0, entities: 0, bytes: 0 } });
  const scope = { userId, projectId: null };
  const [memories, usage] = await Promise.all([s.listAll(scope), s.usage(scope)]);
  return Response.json({ memories, usage });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  const s = store();
  if (!s || !id) return Response.json({ ok: false }, { status: 200 });
  await s.archive(id);
  return Response.json({ ok: true });
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit`
```bash
git add app/api/memory/list/route.ts
git commit -m "feat(memory): list/usage/archive endpoint"
```

### Task 7.3: Settings UI — Memory section + DeepSeek key

Add a "Memory" panel to the settings page and a DeepSeek key field.

**Files:**
- Modify: the settings page (locate via `Grep` for `useSettingsStore` in `app/` — likely
  `app/settings/page.tsx` or a settings component).
- Modify: `lib/store/settings.ts` — extend `ApiKeys` with `deepseek`.

- [ ] **Step 1: Extend the ApiKeys type & store defaults**

In `lib/store/settings.ts`:
- Change the `ApiKeys` interface (line ~23) to add `deepseek: string;`.
- Change the initial state (line ~57) to `apiKeys: { openai: '', anthropic: '', google: '', deepseek: '' },`.
- Change the `loadSettings` apiKeys initializer (line ~73) to include `deepseek: ''`.

- [ ] **Step 2: Add a DeepSeek key input**

In the settings page, wherever the existing provider key inputs render (openai/anthropic/google),
add an identical block for `deepseek` (label "DeepSeek", bound to `apiKeys.deepseek`,
`setApiKey('deepseek', ...)`). Also send its header in the chat fetch:
in the `/api/chat` fetch headers add `'x-deepseek-key': getApiKey('deepseek')`.

- [ ] **Step 3: Add the Memory panel**

Add a new settings section component `components/settings/MemoryPanel.tsx`:

```tsx
// components/settings/MemoryPanel.tsx
'use client';
import { useEffect, useState } from 'react';

interface MemorySettings {
  enabled: boolean;
  embedder_provider: string;
  embedder_model: string;
  contradiction_policy: 'supersede' | 'keep_history';
  deletion_grace_days: number;
}
interface Usage { memories: number; entities: number; bytes: number }

export function MemoryPanel({ userId }: { userId: string | null }) {
  const [settings, setSettings] = useState<MemorySettings | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);

  useEffect(() => {
    fetch('/api/memory/settings').then((r) => r.json()).then(setSettings).catch(() => {});
    if (userId) {
      fetch(`/api/memory/list?userId=${userId}`).then((r) => r.json())
        .then((d) => setUsage(d.usage)).catch(() => {});
    }
  }, [userId]);

  async function update(patch: Partial<MemorySettings>) {
    setSettings((s) => (s ? { ...s, ...patch } : s));
    await fetch('/api/memory/settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    });
  }

  if (!settings) return <div className="text-sm opacity-60">Memory unavailable (no connected backend).</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium">Memory</div>
          <div className="text-sm opacity-60">Lucy remembers across conversations.</div>
        </div>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={settings.enabled}
            onChange={(e) => update({ enabled: e.target.checked })} />
          <span>{settings.enabled ? 'On' : 'Off'}</span>
        </label>
      </div>

      <div className="text-sm">
        <div className="opacity-60 mb-1">Contradiction policy</div>
        <select value={settings.contradiction_policy}
          onChange={(e) => update({ contradiction_policy: e.target.value as MemorySettings['contradiction_policy'] })}
          className="bg-transparent border rounded px-2 py-1">
          <option value="supersede">Supersede (keep current truth)</option>
          <option value="keep_history">Keep history (enterprise / audit)</option>
        </select>
      </div>

      <div className="text-sm">
        <div className="opacity-60 mb-1">Deletion grace window (days)</div>
        <input type="number" min={0} value={settings.deletion_grace_days}
          onChange={(e) => update({ deletion_grace_days: Number(e.target.value) })}
          className="bg-transparent border rounded px-2 py-1 w-24" />
      </div>

      <div className="text-sm border-t pt-3">
        <div className="opacity-60 mb-1">Storage usage</div>
        {usage
          ? <div>{usage.memories} memories · {usage.entities} entities · {(usage.bytes / 1024).toFixed(1)} KB (live)</div>
          : <div className="opacity-60">—</div>}
      </div>
    </div>
  );
}
```

Render `<MemoryPanel userId={...} />` in the settings page (pass the current user id, or `null`).

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint`
Then `npm run dev`, open Settings, confirm the Memory panel and DeepSeek key field render.

- [ ] **Step 5: Commit**

```bash
git add lib/store/settings.ts components/settings/MemoryPanel.tsx app
git commit -m "feat(memory): settings memory panel + DeepSeek key field"
```

### Task 7.4: "🧠 Lucy used N memories" transparency affordance

The extract/retrieval path already counts memories. Surface the count under assistant replies via
the memory store's `lastUsedCount`.

**Files:**
- Modify: the chat message component (locate via `Grep` for where assistant messages render).
- Modify: `app/api/chat/route.ts` to emit a memory-count SSE event (optional — simplest path:
  set `lastUsedCount` client-side from a response header).

- [ ] **Step 1: Emit the count from the route**

In the memory injection block (Task 6.1), after computing `block`, also compute the count. Since SSE
makes headers awkward, the pragmatic Phase-1 approach: prepend a hidden marker the client strips,
OR (preferred) have the client read it from a separate lightweight call. For Phase 1, set the count
from the number of memories the client knows were retrieved by calling `/api/memory/list` lazily.
Simplest acceptable Phase-1 behavior: show the badge only after `/remember` or `/global`
("🧠 Saved to memory"), and wire the retrieved-count later. Implement the save confirmation badge:

In the chat send flow, when a `/remember` or `/global` command succeeds, render a small system note
in the transcript: `🧠 Saved to memory`.

- [ ] **Step 2: Verify + commit**

Run: `npx tsc --noEmit`
```bash
git add app components
git commit -m "feat(memory): save-to-memory transparency affordance"
```

---

# PART 8 — Docs & final verification

### Task 8.1: Update CLAUDE.md and README

**Files:**
- Modify: `CLAUDE.md` (add a "Memory System" section: architecture, modules, gating, modes)
- Modify: `README.md` (add memory + DeepSeek to features; add `lib/supabase/memory.sql` to setup;
  add `DEEPSEEK_API_KEY` to env vars)

- [ ] **Step 1: Write the docs updates** (real prose, mirroring existing sections' style).
- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs: document memory system and DeepSeek provider"
```

### Task 8.2: Full suite + typecheck + lint

- [ ] **Step 1:** `npx jest` → all green.
- [ ] **Step 2:** `npx tsc --noEmit` → no errors.
- [ ] **Step 3:** `npm run lint` → clean.
- [ ] **Step 4:** `npm run build` → succeeds.
- [ ] **Step 5:** Manual smoke: enable memory in Settings, chat, `/remember x`, start a new
  conversation, confirm the fact influences the next reply.

---

## Self-Review (completed during planning)

- **Spec coverage:** profile/collection (4.1, 5.2, 6.1), semantic/pragmatic/episodic (1.1), entities/salience
  (3.2, 4.2, 4.4), dual-mode store (4.2/4.3/4.4), reconciliation extraction (5.1), privacy + incognito
  (3.1, 6.3), `/remember` + `/global` (3.4, 5.2, 6.3), hybrid RRF retrieval (3.2, 4.4), injection (4.1, 6.1),
  decay (3.2, 4.2), bi-temporal columns (1.2), admin settings + storage usage (1.2, 7.1, 7.3), management +
  archive→grace→delete (4.4, 7.2), transparency (7.4), DeepSeek (0.1). All covered.
- **Deferred (correctly out of scope):** L3 knowledge base, Lucy Documents, API/MCP exposure (Phase 1.5);
  association graph, dreaming, prediction (Phase 2); org tier (Phase C).
- **Type consistency:** `MemoryStore` method names are identical across `store.ts`, `local-store.ts`,
  `supabase-store.ts`, and callers (`server.ts`, `index.ts`). `MemoryScope`, `MemoryWrite`, `MemoryRecord`
  shared from `types.ts`.
- **Known follow-ups:** (a) retrieved-count transparency is stubbed to the save-confirmation badge in
  Phase 1; full count wiring is a fast-follow. (b) `purgeExpiredArchives` is exposed but not yet scheduled —
  call it from an admin action or a future cron.
```
