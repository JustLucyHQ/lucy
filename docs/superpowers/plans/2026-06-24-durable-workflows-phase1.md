# Durable Workflows Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Lucy workflows execute server-side and durably — a click of **Run** (connected mode) enqueues a run that a background worker executes off the browser tab, persists with full status + per-node logs, and shows in a Runs history view.

**Architecture:** Postgres-as-queue (`lucy.workflow_runs` + a `claim_workflow_run()` `SKIP LOCKED` RPC) drained by an in-process worker started once via `instrumentation.ts` (connected mode only). The existing `WorkflowEngine` runs server-side via injected dependencies (KB search + Supabase client); provider keys are decrypted server-side. The builder POSTs the canvas definition, then polls the run. Desktop/standalone (no Supabase) keeps the client-side engine unchanged.

**Tech Stack:** Next.js 16 App Router, TypeScript, Jest (tests live in `__tests__/`), self-hosted Supabase (`lucy` schema), `@supabase/supabase-js`.

**Spec:** `docs/superpowers/specs/2026-06-24-durable-workflows-phase1-design.md`

**Conventions for every task:** run `npx tsc --noEmit` and `npx eslint <changed files>` before each commit; both must be clean. Jest: `npx jest <path>`.

---

## File map

| File | Responsibility |
|---|---|
| `lib/supabase/workflow_runs.sql` | NEW — alter `workflow_runs`, indexes, `claim_workflow_run()` RPC |
| `lib/workflow/engine.ts` | MODIFY — optional injected `EngineDeps` (KB search + Supabase client) |
| `lib/workflow/server-runner.ts` | NEW — `executeRun()`: keys, deps, log persistence, status |
| `lib/workflow/worker.ts` | NEW — `startWorkflowWorker()`: poll loop, claim, boot reaper, singleton |
| `instrumentation.ts` | NEW — `register()` starts the worker (connected mode only) |
| `app/api/workflows/run/route.ts` | NEW — POST: enqueue a manual run |
| `app/api/workflows/runs/[runId]/route.ts` | NEW — GET: one run (poll) |
| `app/api/workflows/runs/route.ts` | NEW — GET: run history list |
| `app/workflows/[id]/page.tsx` | MODIFY — server-run + poll when connected; client engine otherwise |
| `components/workflow/RunsHistory.tsx` | NEW — run history list + detail |
| `lib/workflow/registry.ts`, `lib/workflow/types.ts`, `components/workflow/NodeConfigPanel.tsx` | MODIFY — relabel `llm` node → "AI Agent" + prominent model picker |
| `docs/DEPLOYMENT.md` | MODIFY — migration list + Workflows note |

---

## Task 1: Migration — `workflow_runs` queue columns + claim RPC

**Files:**
- Create: `lib/supabase/workflow_runs.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Durable workflow runs (Phase 1). Apply to the cloud + dev Supabase as
-- supabase_admin. workflow_runs already exists (schema.sql); this adds the queue
-- columns + an atomic claim RPC.

alter table lucy.workflow_runs add column if not exists definition jsonb;
alter table lucy.workflow_runs add column if not exists name text;
alter table lucy.workflow_runs add column if not exists enqueued_at timestamptz default now();
alter table lucy.workflow_runs add column if not exists trigger text not null default 'manual';
alter table lucy.workflow_runs add column if not exists attempt int not null default 0;

-- started_at must be set when CLAIMED, not at insert.
alter table lucy.workflow_runs alter column started_at drop default;
alter table lucy.workflow_runs alter column status set default 'queued';

create index if not exists idx_workflow_runs_claim on lucy.workflow_runs (status, enqueued_at);
create index if not exists idx_workflow_runs_user  on lucy.workflow_runs (user_id, enqueued_at desc);

-- Atomic claim of one queued run. FOR UPDATE SKIP LOCKED makes concurrent
-- workers/instances safe. SECURITY DEFINER so the service role can run it.
create or replace function lucy.claim_workflow_run()
returns lucy.workflow_runs
language plpgsql
security definer
set search_path = lucy
as $$
declare
  claimed lucy.workflow_runs;
begin
  select * into claimed from lucy.workflow_runs
    where status = 'queued'
    order by enqueued_at
    for update skip locked
    limit 1;
  if not found then
    return null;
  end if;
  update lucy.workflow_runs
    set status = 'running', started_at = now(), attempt = attempt + 1
    where id = claimed.id
    returning * into claimed;
  return claimed;
end;
$$;

grant execute on function lucy.claim_workflow_run() to service_role;
```

- [ ] **Step 2: Apply to the dev DB and verify**

Run:
```bash
docker exec -i supabase-db psql -U supabase_admin -d postgres < /c/RepositoryAI/LucyAI/lib/supabase/workflow_runs.sql
```
Expected: `ALTER TABLE` ×5, `CREATE INDEX` ×2, `CREATE FUNCTION`, `GRANT`.

- [ ] **Step 3: Verify the claim RPC works on an empty queue**

Run:
```bash
docker exec -i supabase-db psql -U supabase_admin -d postgres -c "select lucy.claim_workflow_run() is null as empty_returns_null;"
```
Expected: `empty_returns_null | t`

- [ ] **Step 4: Commit**

```bash
git add lib/supabase/workflow_runs.sql
git commit -m "Workflows: workflow_runs queue columns + claim_workflow_run RPC"
```

---

## Task 2: Engine — injected `EngineDeps` (server-safe)

Make `WorkflowEngine` runnable server-side by injecting the two browser-coupled operations, defaulting to today's browser behavior so the client path is unchanged.

**Files:**
- Modify: `lib/workflow/engine.ts`
- Test: `lib/workflow/__tests__/engine-deps.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/workflow/__tests__/engine-deps.test.ts
import { WorkflowEngine } from '../engine';
import type { Workflow } from '../types';

function kbWorkflow(): Workflow {
  return {
    id: 'w1', name: 'kb', description: '', isPublished: false, createdAt: 0, updatedAt: 0,
    nodes: [
      { id: 'start', type: 'start', position: { x: 0, y: 0 }, data: { nodeType: 'start', label: 'Start',
        config: { inputVariables: [{ name: 'user_query', description: '', defaultValue: '' }] } } },
      { id: 'kb', type: 'knowledgeBase', position: { x: 0, y: 0 }, data: { nodeType: 'knowledgeBase', label: 'KB',
        config: { collectionName: '', query: '{{user_query}}', topK: 3 } } },
    ],
    edges: [{ id: 'e', source: 'start', target: 'kb' }],
  };
}

describe('WorkflowEngine EngineDeps', () => {
  it('uses injected searchKnowledgeBase instead of fetch', async () => {
    const calls: Array<[string, number]> = [];
    const engine = new WorkflowEngine(kbWorkflow(), {}, {
      searchKnowledgeBase: async (query, topK) => { calls.push([query, topK]); return 'INJECTED'; },
    });
    const result = await engine.execute({ user_query: 'hello' }, {});
    expect(calls).toEqual([['hello', 3]]);
    expect(result.status).toBe('completed');
    const kbLog = result.logs.find((l) => l.nodeId === 'kb');
    expect(kbLog?.output).toBe('INJECTED');
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx jest lib/workflow/__tests__/engine-deps.test.ts`
Expected: FAIL — the engine constructor takes only 2 args; injected dep is ignored (output is not `INJECTED`).

- [ ] **Step 3: Add `EngineDeps` and wire the two executors**

In `lib/workflow/engine.ts`, add the import for the Supabase type near the top imports:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
```

Add the interface just after `EngineCallbacks`:

```ts
// ─── Injected dependencies (server vs browser) ─────────────────────────────
export interface EngineDeps {
  /** KB search. Browser default: fetch('/api/memory/search'). */
  searchKnowledgeBase?: (query: string, topK: number) => Promise<string>;
  /** Supabase client for integration nodes. Browser default: getSupabaseClient(). */
  supabaseClient?: SupabaseClient | null;
}
```

Change the class field + constructor:

```ts
  private callbacks: EngineCallbacks;
  private deps: EngineDeps;

  constructor(
    workflow: Workflow,
    callbacks: EngineCallbacks = {},
    deps: EngineDeps = {}
  ) {
    this.nodes = new Map(workflow.nodes.map((n) => [n.id, n]));
    this.edges = workflow.edges;
    this.callbacks = callbacks;
    this.deps = deps;
  }
```

In `runKnowledgeBase`, add the injection branch at the very top of the method (after computing `query`):

```ts
  private async runKnowledgeBase(node: WorkflowNode, context: ExecutionContext): Promise<string> {
    const config = asKBConfig(node.data.config);
    const query = this.interpolate(config.query, context).trim();
    if (!query) return '';

    if (this.deps.searchKnowledgeBase) {
      return await this.deps.searchKnowledgeBase(query, config.topK);
    }

    const res = await fetch('/api/memory/search', {
```
(everything below the original `const res = await fetch(...)` stays unchanged.)

In `runIntegration`, replace the client resolution line:

```ts
    const supabase = this.deps.supabaseClient ?? (typeof window !== 'undefined' ? getSupabaseClient() : null);
```
(was: `const supabase = typeof window !== 'undefined' ? getSupabaseClient() : null;`)

- [ ] **Step 4: Run the test — expect PASS**

Run: `npx jest lib/workflow/__tests__/engine-deps.test.ts`
Expected: PASS.

- [ ] **Step 5: tsc + lint + commit**

```bash
npx tsc --noEmit && npx eslint lib/workflow/engine.ts lib/workflow/__tests__/engine-deps.test.ts
git add lib/workflow/engine.ts lib/workflow/__tests__/engine-deps.test.ts
git commit -m "Workflows: inject EngineDeps (KB search + Supabase client) for server execution"
```

---

## Task 3: Server runner — `executeRun()`

Runs a queued run server-side: decrypt the user's keys, inject server deps, persist logs + final status.

**Files:**
- Create: `lib/workflow/server-runner.ts`
- Test: `lib/workflow/__tests__/server-runner.test.ts`

- [ ] **Step 1: Write the failing test (a fake Supabase-ish client)**

```ts
// lib/workflow/__tests__/server-runner.test.ts
import { executeRun, type WorkflowRunRow } from '../server-runner';
import type { Workflow } from '../types';

// Minimal fake of the chained supabase client used by executeRun.
function fakeClient(updates: Record<string, unknown>[]) {
  return {
    from(table: string) {
      return {
        select() { return this; },
        eq() { return this; },
        // provider_configs read → no keys
        then(resolve: (v: { data: unknown[] }) => void) { resolve({ data: [] }); },
        update(patch: Record<string, unknown>) {
          updates.push({ table, ...patch });
          return { eq: async () => ({ error: null }) };
        },
      };
    },
  } as never;
}

function twoNodeWorkflow(): Workflow {
  return {
    id: 'w', name: 'two', description: '', isPublished: false, createdAt: 0, updatedAt: 0,
    nodes: [
      { id: 'start', type: 'start', position: { x: 0, y: 0 }, data: { nodeType: 'start', label: 'Start',
        config: { inputVariables: [{ name: 'user_query', description: '', defaultValue: '' }] } } },
      { id: 'out', type: 'output', position: { x: 0, y: 0 }, data: { nodeType: 'output', label: 'Output',
        config: { displayName: 'Result', format: 'text' } } },
    ],
    edges: [{ id: 'e', source: 'start', target: 'out' }],
  };
}

describe('executeRun', () => {
  it('persists succeeded + outputs for a passing workflow', async () => {
    const updates: Record<string, unknown>[] = [];
    const run: WorkflowRunRow = { id: 'r1', user_id: 'u1', definition: twoNodeWorkflow(), inputs: { user_query: 'hi' } };
    await executeRun(run, fakeClient(updates));
    const final = updates[updates.length - 1];
    expect(final.status).toBe('succeeded');
    expect((final.outputs as { finalOutput: string }).finalOutput).toContain('hi');
    expect(final.completed_at).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx jest lib/workflow/__tests__/server-runner.test.ts`
Expected: FAIL — `Cannot find module '../server-runner'`.

- [ ] **Step 3: Implement `server-runner.ts`**

```ts
// lib/workflow/server-runner.ts
/**
 * Server-side execution of a queued workflow run. Decrypts the run owner's
 * provider keys, injects server-safe engine deps, persists per-node logs as they
 * arrive, then writes the final status.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { WorkflowEngine } from './engine';
import type { Workflow, ExecutionLogEntry } from './types';
import { decryptProviderKey } from '@/lib/auth/provider-keys';
import { SupabaseMemoryStore } from '@/lib/memory/supabase-store';

export interface WorkflowRunRow {
  id: string;
  user_id: string;
  definition: Workflow;
  inputs: Record<string, string> | null;
}

const LOG_FLUSH_MS = 1000;

export async function executeRun(run: WorkflowRunRow, client: SupabaseClient): Promise<void> {
  // 1) Decrypt the owner's provider keys.
  const apiKeys: Record<string, string> = {};
  try {
    const { data: cfgs } = await client
      .from('provider_configs')
      .select('provider, api_key_encrypted')
      .eq('user_id', run.user_id)
      .eq('is_active', true);
    for (const c of (cfgs ?? []) as { provider: string; api_key_encrypted: string }[]) {
      const key = decryptProviderKey(c.api_key_encrypted);
      if (key) apiKeys[c.provider] = key;
    }
  } catch {
    /* no keys → LLM nodes will fail with a clear message */
  }

  // 2) Server-safe engine deps.
  const deps = {
    searchKnowledgeBase: async (query: string, topK: number): Promise<string> => {
      const store = new SupabaseMemoryStore(client, { apiKey: '' });
      const records = await store.search({ userId: run.user_id, projectId: null }, query, { limit: topK });
      if (!records.length) return `No relevant memories found for: ${query}`;
      return records
        .map((r: { content?: string; text?: string }, i: number) => `${i + 1}. ${r.content ?? r.text ?? ''}`)
        .join('\n');
    },
    supabaseClient: client,
  };

  // 3) Run with throttled log persistence.
  const logs: ExecutionLogEntry[] = [];
  let lastFlush = 0;
  const flush = async (final = false) => {
    const now = Date.now();
    if (!final && now - lastFlush < LOG_FLUSH_MS) return;
    lastFlush = now;
    await client.from('workflow_runs').update({ logs }).eq('id', run.id);
  };

  const engine = new WorkflowEngine(
    run.definition,
    { onLog: (e) => { logs.push(e); void flush(); } },
    deps
  );

  try {
    const result = await engine.execute(run.inputs ?? {}, apiKeys);
    await client.from('workflow_runs').update({
      status: result.status === 'completed' ? 'succeeded' : 'failed',
      outputs: { finalOutput: result.finalOutput ?? null },
      error: result.error ?? null,
      logs: result.logs,
      completed_at: new Date().toISOString(),
    }).eq('id', run.id);
  } catch (err) {
    await client.from('workflow_runs').update({
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
      logs,
      completed_at: new Date().toISOString(),
    }).eq('id', run.id);
  }
}
```

- [ ] **Step 4: Run the test — expect PASS**

Run: `npx jest lib/workflow/__tests__/server-runner.test.ts`
Expected: PASS.

- [ ] **Step 5: tsc + lint + commit**

```bash
npx tsc --noEmit && npx eslint lib/workflow/server-runner.ts lib/workflow/__tests__/server-runner.test.ts
git add lib/workflow/server-runner.ts lib/workflow/__tests__/server-runner.test.ts
git commit -m "Workflows: server-runner executes a queued run + persists status/logs"
```

> Note: if tsc flags the `MemoryRecord` field, open `lib/memory/supabase-store.ts`, check the record type returned by `search`, and use that field name in the `.map` (replace `r.content ?? r.text`). Keep the numbered-list format identical to the browser path.

---

## Task 4: Worker — poll loop + atomic claim + boot reaper

**Files:**
- Create: `lib/workflow/worker.ts`

- [ ] **Step 1: Implement the worker**

```ts
// lib/workflow/worker.ts
/**
 * In-process workflow worker. Started once per server process (connected mode)
 * by instrumentation.ts. Drains the workflow_runs queue via the claim RPC.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { executeRun, type WorkflowRunRow } from './server-runner';

const POLL_MS = 3000;

export function startWorkflowWorker(): void {
  const g = globalThis as unknown as { __lucyWorkflowWorker?: boolean };
  if (g.__lucyWorkflowWorker) return;
  g.__lucyWorkflowWorker = true;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const client: SupabaseClient = createClient(url, key, { db: { schema: 'lucy' } });

  // Boot reaper: any run left 'running' belongs to a dead process (single-instance
  // assumption — SKIP LOCKED already protects the claim path if that changes).
  void client
    .from('workflow_runs')
    .update({ status: 'failed', error: 'interrupted (server restart)', completed_at: new Date().toISOString() })
    .eq('status', 'running')
    .then(() => {});

  const tick = async (): Promise<void> => {
    try {
      // Drain all currently-queued runs, one at a time.
      for (;;) {
        const { data, error } = await client.rpc('claim_workflow_run');
        if (error) { console.error('[workflow-worker] claim error:', error.message); break; }
        const run = (Array.isArray(data) ? data[0] : data) as WorkflowRunRow | null;
        if (!run) break;
        await executeRun(run, client);
      }
    } catch (e) {
      console.error('[workflow-worker] tick error:', e);
    }
    setTimeout(() => void tick(), POLL_MS);
  };

  void tick();
  console.log('[workflow-worker] started');
}
```

- [ ] **Step 2: tsc + lint**

Run: `npx tsc --noEmit && npx eslint lib/workflow/worker.ts`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add lib/workflow/worker.ts
git commit -m "Workflows: in-process worker (claim loop + boot reaper)"
```

---

## Task 5: `instrumentation.ts` — start the worker (connected mode only)

**Files:**
- Create: `instrumentation.ts` (project root)

- [ ] **Step 1: Implement register()**

```ts
// instrumentation.ts
/**
 * Next.js server-boot hook. Starts the workflow worker once, only on the Node
 * runtime and only in connected mode (Supabase configured) — so the desktop
 * standalone server never runs it.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  const { startWorkflowWorker } = await import('./lib/workflow/worker');
  startWorkflowWorker();
}
```

- [ ] **Step 2: Verify it loads in dev**

Restart the dev server (`npm run dev`), then check the log:
```bash
# in the dev server output, expect a line:
# [workflow-worker] started
```
If it doesn't appear, confirm `.env.local` has `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, and that `instrumentation.ts` is at the project root (not under `app/`).

- [ ] **Step 3: tsc + lint + commit**

```bash
npx tsc --noEmit && npx eslint instrumentation.ts
git add instrumentation.ts
git commit -m "Workflows: start worker from instrumentation.ts (connected mode only)"
```

---

## Task 6: Trigger API — `POST /api/workflows/run`

**Files:**
- Create: `app/api/workflows/run/route.ts`
- Test: `app/api/workflows/__tests__/run-validation.test.ts`

- [ ] **Step 1: Write the failing test (pure validation helper)**

```ts
// app/api/workflows/__tests__/run-validation.test.ts
import { validateRunBody } from '../run/validate';

describe('validateRunBody', () => {
  it('rejects a definition with no start node', () => {
    const r = validateRunBody({ definition: { name: 'x', nodes: [{ data: { nodeType: 'output' } }], edges: [] }, inputs: {} });
    expect(r.ok).toBe(false);
  });
  it('accepts a definition with a start node and normalizes workflowId', () => {
    const r = validateRunBody({
      workflowId: 'wf_123_abc',
      definition: { name: 'x', nodes: [{ data: { nodeType: 'start' } }], edges: [] },
      inputs: { a: '1' },
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.workflowId).toBeNull(); // non-UUID → null
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`Cannot find module '../run/validate'`)

Run: `npx jest app/api/workflows/__tests__/run-validation.test.ts`

- [ ] **Step 3: Implement the validator**

```ts
// app/api/workflows/run/validate.ts
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface DefNode { data?: { nodeType?: string } }
export interface ValidRun {
  ok: true;
  name: string;
  definition: { name: string; nodes: DefNode[]; edges: unknown[] };
  inputs: Record<string, string>;
  workflowId: string | null;
}
export type ValidateResult = ValidRun | { ok: false; status: number; error: string };

export function validateRunBody(body: unknown): ValidateResult {
  const b = body as { workflowId?: unknown; definition?: { name?: unknown; nodes?: unknown; edges?: unknown }; inputs?: unknown } | null;
  const def = b?.definition;
  if (!def || !Array.isArray(def.nodes)) return { ok: false, status: 400, error: 'Missing workflow definition' };
  if (def.nodes.length > 500) return { ok: false, status: 413, error: 'Workflow too large' };
  const hasStart = (def.nodes as DefNode[]).some((n) => n?.data?.nodeType === 'start');
  if (!hasStart) return { ok: false, status: 400, error: 'Workflow needs a Start node' };
  const workflowId = typeof b?.workflowId === 'string' && UUID_RE.test(b.workflowId) ? b.workflowId : null;
  const inputs = (b?.inputs && typeof b.inputs === 'object' ? b.inputs : {}) as Record<string, string>;
  return {
    ok: true,
    name: typeof def.name === 'string' ? def.name : 'Workflow',
    definition: { name: typeof def.name === 'string' ? def.name : 'Workflow', nodes: def.nodes as DefNode[], edges: Array.isArray(def.edges) ? def.edges : [] },
    inputs,
    workflowId,
  };
}
```

- [ ] **Step 4: Run the test — expect PASS**

Run: `npx jest app/api/workflows/__tests__/run-validation.test.ts`

- [ ] **Step 5: Implement the route**

```ts
// app/api/workflows/run/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { resolveMemoryAuth } from '@/lib/memory/auth';
import { validateRunBody } from './validate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { userId, client } = await resolveMemoryAuth(req);
  if (!userId || !client) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const v = validateRunBody(await req.json().catch(() => null));
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: v.status });

  const { data, error } = await client
    .from('workflow_runs')
    .insert({
      user_id: userId,
      workflow_id: v.workflowId,
      name: v.name,
      definition: v.definition,
      inputs: v.inputs,
      status: 'queued',
      enqueued_at: new Date().toISOString(),
      trigger: 'manual',
    })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ runId: data.id });
}
```

- [ ] **Step 6: tsc + lint + commit**

```bash
npx tsc --noEmit && npx eslint app/api/workflows/run/route.ts app/api/workflows/run/validate.ts app/api/workflows/__tests__/run-validation.test.ts
git add app/api/workflows/run/route.ts app/api/workflows/run/validate.ts app/api/workflows/__tests__/run-validation.test.ts
git commit -m "Workflows: POST /api/workflows/run enqueues a manual run"
```

---

## Task 7: Run status + history APIs

**Files:**
- Create: `app/api/workflows/runs/[runId]/route.ts`
- Create: `app/api/workflows/runs/route.ts`

- [ ] **Step 1: Implement the single-run route**

```ts
// app/api/workflows/runs/[runId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { resolveMemoryAuth } from '@/lib/memory/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const { userId, client } = await resolveMemoryAuth(req);
  if (!userId || !client) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { runId } = await params;

  const { data, error } = await client
    .from('workflow_runs')
    .select('id, status, name, inputs, outputs, logs, error, enqueued_at, started_at, completed_at')
    .eq('id', runId)
    .eq('user_id', userId)
    .single();

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ run: data });
}
```

- [ ] **Step 2: Implement the history route**

```ts
// app/api/workflows/runs/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { resolveMemoryAuth } from '@/lib/memory/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { userId, client } = await resolveMemoryAuth(req);
  if (!userId || !client) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const workflowId = searchParams.get('workflowId');
  const limit = Math.min(Number(searchParams.get('limit')) || 20, 100);

  let q = client
    .from('workflow_runs')
    .select('id, status, name, error, enqueued_at, started_at, completed_at')
    .eq('user_id', userId)
    .order('enqueued_at', { ascending: false })
    .limit(limit);
  if (workflowId) q = q.eq('workflow_id', workflowId);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ runs: data ?? [] });
}
```

- [ ] **Step 3: tsc + lint + commit**

```bash
npx tsc --noEmit && npx eslint app/api/workflows/runs/[runId]/route.ts app/api/workflows/runs/route.ts
git add app/api/workflows/runs
git commit -m "Workflows: GET run status + run history APIs"
```

---

## Task 8: End-to-end integration check (dev Supabase + dev worker)

Before touching the UI, prove the backend path works exactly like the sync feature was verified.

- [ ] **Step 1: Ensure the dev server (with the worker) is running**

Run: `npm run dev` (port 3001) — confirm `[workflow-worker] started` in the output.

- [ ] **Step 2: Enqueue a 2-node run with the admin API key and poll it**

Run:
```bash
node -e '
const os=require("os"); const cfg=require(os.homedir()+"/.lucy/config.json"); const key=cfg.apiKey;
const definition={ name:"e2e", nodes:[
  {id:"start",type:"start",position:{x:0,y:0},data:{nodeType:"start",label:"Start",config:{inputVariables:[{name:"user_query",description:"",defaultValue:""}]}}},
  {id:"t",type:"transform",position:{x:0,y:0},data:{nodeType:"transform",label:"T",config:{operation:"uppercase"}}},
  {id:"out",type:"output",position:{x:0,y:0},data:{nodeType:"output",label:"Out",config:{displayName:"Result",format:"text"}}}
], edges:[{id:"e1",source:"start",target:"t"},{id:"e2",source:"t",target:"out"}]};
(async()=>{
  const r=await fetch("http://localhost:3001/api/workflows/run",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+key},body:JSON.stringify({definition,inputs:{user_query:"hello"}})});
  const {runId}=await r.json(); console.log("runId",runId);
  for(let i=0;i<15;i++){ await new Promise(s=>setTimeout(s,1000));
    const g=await fetch("http://localhost:3001/api/workflows/runs/"+runId,{headers:{"Authorization":"Bearer "+key}});
    const {run}=await g.json(); console.log(i,run.status, (run.outputs&&run.outputs.finalOutput));
    if(run.status==="succeeded"||run.status==="failed") break;
  }
})();
'
```
Expected: status transitions to `succeeded` and `finalOutput` is `HELLO` (start → uppercase → output).

- [ ] **Step 3: Confirm the run persisted**

Run:
```bash
docker exec -i supabase-db psql -U supabase_admin -d postgres -t -c "select status, outputs->>'finalOutput' from lucy.workflow_runs order by enqueued_at desc limit 1;"
```
Expected: `succeeded | HELLO`.

- [ ] **Step 4: Clean up the test row**

Run:
```bash
docker exec -i supabase-db psql -U supabase_admin -d postgres -c "delete from lucy.workflow_runs where name='e2e';"
```

No commit (verification only). If anything fails, fix the relevant task before proceeding.

---

## Task 9: Builder — server run + poll (connected) ; client engine (standalone)

**Files:**
- Modify: `app/workflows/[id]/page.tsx` (the `handleRunConfirm` callback, ~lines 207-256)

- [ ] **Step 1: Add the import**

Near the other imports in `app/workflows/[id]/page.tsx`, add:

```ts
import { isSupabaseEnabled } from '@/lib/supabase/client';
```

- [ ] **Step 2: Replace the engine block with a mode branch**

Replace the body of `handleRunConfirm` from the `const workflow: Workflow = {...}` line through the `catch` block (the part that builds `workflow`, constructs `WorkflowEngine`, and calls `engine.execute`) with:

```ts
      const definition: Workflow = {
        id: workflowId || id,
        name: workflowName,
        description: workflowDescription,
        nodes,
        edges,
        isPublished: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      // Connected mode → durable server run + poll. Standalone → client engine.
      if (isSupabaseEnabled()) {
        try {
          const res = await fetch('/api/workflows/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ workflowId: workflowId || id, definition, inputs }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data?.error || `Run failed (HTTP ${res.status})`);
          const runId: string = data.runId;

          // Poll until terminal; reflect logs + per-node status into the store.
          for (;;) {
            await new Promise((r) => setTimeout(r, 1000));
            const g = await fetch(`/api/workflows/runs/${runId}`);
            if (!g.ok) throw new Error('Lost the run');
            const { run } = await g.json();
            resetExecution();
            for (const entry of (run.logs ?? []) as ExecutionLogEntry[]) {
              appendLog(entry);
              updateNodeStatus(entry.nodeId, entry.status, entry.output, entry.error);
            }
            if (run.status === 'succeeded') {
              setExecutionStatus('completed');
              if (run.outputs?.finalOutput) setFinalOutput(run.outputs.finalOutput);
              break;
            }
            if (run.status === 'failed') {
              setExecutionStatus('error');
              setExecutionError(run.error || 'Workflow failed');
              break;
            }
            setExecutionStatus('running');
          }
        } catch (err) {
          setExecutionStatus('error');
          setExecutionError(err instanceof Error ? err.message : 'Execution failed');
        }
        return;
      }

      const engine = new WorkflowEngine(definition, {
        onNodeStart: (nodeId) => updateNodeStatus(nodeId, 'running'),
        onNodeEnd: (nodeId, status, output, error) => updateNodeStatus(nodeId, status, output, error),
        onLog: (entry) => appendLog(entry),
      });

      try {
        const result = await engine.execute(inputs, apiKeys);
        setExecutionStatus(result.status);
        if (result.finalOutput) setFinalOutput(result.finalOutput);
        if (result.error) setExecutionError(result.error);
      } catch (err) {
        setExecutionStatus('error');
        setExecutionError(err instanceof Error ? err.message : 'Execution failed');
      }
```

Ensure `ExecutionLogEntry` is imported in this file (add to the existing `@/lib/workflow/types` import if missing):

```ts
import type { Workflow, StartNodeConfig, ExecutionLogEntry } from '@/lib/workflow/types';
```

- [ ] **Step 3: tsc + lint**

Run: `npx tsc --noEmit && npx eslint "app/workflows/[id]/page.tsx"`
Expected: clean. (The `apiKeys` block above the branch is still used by the standalone path — keep it.)

- [ ] **Step 4: Manual check (connected dev)**

Open `http://localhost:3001/workflows/<a workflow>`, click **Run**, enter an input, confirm: the Run panel fills with per-node logs and a final output, and the run is now in `lucy.workflow_runs` (`select count(*) from lucy.workflow_runs;`). Closing the tab mid-run leaves the run completing server-side (re-open history to see it succeeded).

- [ ] **Step 5: Commit**

```bash
git add "app/workflows/[id]/page.tsx"
git commit -m "Workflows: builder runs server-side + polls in connected mode"
```

---

## Task 10: Runs history UI

**Files:**
- Create: `components/workflow/RunsHistory.tsx`
- Modify: `app/workflows/[id]/page.tsx` (mount the panel; wire the existing "See Runs" affordance)

- [ ] **Step 1: Implement the history component**

```tsx
// components/workflow/RunsHistory.tsx
'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { X, Loader2, CheckCircle2, AlertCircle, Clock } from 'lucide-react';

interface RunSummary {
  id: string; status: string; name: string | null; error: string | null;
  enqueued_at: string; started_at: string | null; completed_at: string | null;
}

function statusIcon(status: string) {
  if (status === 'running' || status === 'queued') return <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />;
  if (status === 'succeeded') return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
  if (status === 'failed') return <AlertCircle className="w-3.5 h-3.5 text-red-400" />;
  return <Clock className="w-3.5 h-3.5 text-gray-500" />;
}

export function RunsHistory({ workflowId, onClose }: { workflowId: string; onClose: () => void }) {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/workflows/runs?workflowId=${encodeURIComponent(workflowId)}&limit=30`);
      const data = await res.json();
      setRuns(data.runs ?? []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [workflowId]);

  useEffect(() => { load(); const t = setInterval(load, 3000); return () => clearInterval(t); }, [load]);

  return (
    <div className="absolute right-0 top-0 h-full w-80 bg-gray-900 border-l border-gray-800 flex flex-col z-20">
      <div className="flex items-center justify-between px-4 h-10 border-b border-gray-800 shrink-0">
        <span className="text-xs font-medium text-gray-300">Runs</span>
        <button onClick={onClose} className="text-gray-600 hover:text-gray-300"><X className="w-4 h-4" /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {loading ? (
          <p className="text-xs text-gray-600 p-2">Loading…</p>
        ) : runs.length === 0 ? (
          <p className="text-xs text-gray-600 p-2">No runs yet. Click Run to start one.</p>
        ) : runs.map((r) => {
          const dur = r.completed_at && r.started_at
            ? `${Math.max(0, Math.round((new Date(r.completed_at).getTime() - new Date(r.started_at).getTime()) / 100) / 10)}s`
            : '';
          return (
            <div key={r.id} className="flex items-center gap-2 px-2 py-1.5 rounded text-xs bg-gray-800/50 border border-gray-800">
              {statusIcon(r.status)}
              <span className="text-gray-300 flex-1 truncate">{r.status}{r.error ? ` — ${r.error}` : ''}</span>
              <span className="text-gray-600">{dur}</span>
              <span className="text-gray-600">{new Date(r.enqueued_at).toLocaleTimeString()}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Mount it from the builder**

In `app/workflows/[id]/page.tsx`, add state + render. Near the other `useState` calls add:

```ts
const [showRuns, setShowRuns] = useState(false);
```

Import it:

```ts
import { RunsHistory } from '@/components/workflow/RunsHistory';
```

In the returned JSX, inside the main editor container (the element that wraps `WorkflowCanvas` — it must be `relative`), render:

```tsx
{showRuns && (
  <RunsHistory workflowId={workflowId || id} onClose={() => setShowRuns(false)} />
)}
```

Wire a toggle: pass `onShowRuns={() => setShowRuns((v) => !v)}` to `WorkflowToolbar` and add a "Runs" button there. If `WorkflowToolbar`'s props are fixed, instead add a small button in the page header row next to Run:

```tsx
<button onClick={() => setShowRuns((v) => !v)} className="text-xs px-2 py-1 rounded text-gray-400 hover:text-gray-200">See Runs</button>
```

(Check `components/workflow/WorkflowToolbar.tsx` first; reuse its button styling. The existing screenshot shows a "See Runs" control, so a prop may already be threaded — prefer wiring that.)

- [ ] **Step 3: tsc + lint + manual check**

Run: `npx tsc --noEmit && npx eslint components/workflow/RunsHistory.tsx "app/workflows/[id]/page.tsx"`
Open a workflow, run it, open **Runs** → the run appears with status + duration and live-updates.

- [ ] **Step 4: Commit**

```bash
git add components/workflow/RunsHistory.tsx "app/workflows/[id]/page.tsx"
git commit -m "Workflows: Runs history panel"
```

---

## Task 11: "AI Agent" node relabel + model picker

**Files:**
- Modify: `lib/workflow/types.ts` (the `llm` default label)
- Modify: `lib/workflow/registry.ts` (the `llm` registry entry)
- Modify: `components/workflow/NodeConfigPanel.tsx` (make provider+model prominent)

- [ ] **Step 1: Relabel the default config**

In `lib/workflow/types.ts`, in `NODE_CONFIG_DEFAULTS.llm`, change the label:

```ts
  llm: {
    label: 'AI Agent',
    provider: 'openai',
    model: 'gpt-4o',
    systemPrompt: 'You are a helpful assistant.',
    temperature: 0.7,
    maxTokens: 1024,
    inputVariable: 'user_query',
  } satisfies LLMNodeConfig,
```

- [ ] **Step 2: Relabel the registry entry**

In `lib/workflow/registry.ts`, update the `llm` entry's `label`/`description` (keep `type: 'llm'`):

```ts
  llm: {
    type: 'llm',
    label: 'AI Agent',
    description: 'Run an AI model — pick the provider and model',
    group: 'ai',
    color: 'bg-purple-600',
    textColor: 'text-purple-400',
    borderColor: 'border-purple-600',
    iconName: 'Sparkles',
    hasTargetHandle: true,
    hasSourceHandle: true,
    defaultConfig: NODE_CONFIG_DEFAULTS.llm,
  },
```

- [ ] **Step 3: Make provider + model prominent in the config panel**

Open `components/workflow/NodeConfigPanel.tsx`, find the `llm` config section (search for `provider` / `model` inputs). Ensure it renders, near the top of the LLM section, a clear **Provider** select (`openai` / `anthropic` / `google`) and a **Model** select whose options come from that provider's models. Use the providers registry the chat selector uses:

```ts
import { getModelsByProvider } from '@/lib/providers';
// ...
const modelsForProvider = getModelsByProvider()[(config as LLMNodeConfig).provider] ?? [];
```
Render the Model `<select>` from `modelsForProvider.map((m) => ({ value: m.id, label: m.name }))`, and when the provider changes, default `model` to `modelsForProvider[0]?.id`. (Mirror the existing select styling in the panel; do not restyle the panel.)

> Read the file first — if a provider/model selector already exists for `llm`, this step is just verifying both are present and labeled, plus the "AI Agent" heading.

- [ ] **Step 4: tsc + lint + manual check**

Run: `npx tsc --noEmit && npx eslint lib/workflow/types.ts lib/workflow/registry.ts components/workflow/NodeConfigPanel.tsx`
Open the builder: the palette + node show **AI Agent**; selecting the node shows Provider + Model pickers; changing provider repopulates models.

- [ ] **Step 5: Commit**

```bash
git add lib/workflow/types.ts lib/workflow/registry.ts components/workflow/NodeConfigPanel.tsx
git commit -m "Workflows: relabel LLM node as AI Agent with provider + model picker"
```

---

## Task 12: Docs + final verification

**Files:**
- Modify: `docs/DEPLOYMENT.md`

- [ ] **Step 1: Add the migration + a Workflows note**

In `docs/DEPLOYMENT.md`, add to the SQL migration list (Section 2):

```markdown
- `lib/supabase/workflow_runs.sql` — durable workflow runs (queue columns + claim RPC)
```

And add a short subsection after the Local Whisper section:

```markdown
## 12. Workflows (durable execution)

Connected mode runs workflows **server-side**: clicking Run enqueues a
`lucy.workflow_runs` row, an in-process worker (started by `instrumentation.ts`,
connected mode only) claims it via `claim_workflow_run()` (`SKIP LOCKED`),
executes with the user's decrypted provider keys, and persists status + per-node
logs. The builder polls the run and a Runs panel shows history. Requires
`lib/supabase/workflow_runs.sql` applied to the DB. Desktop/standalone keeps the
client-side engine (no worker). Schedules + webhooks are Phase 2.
```

- [ ] **Step 2: Full verification sweep**

Run:
```bash
npx tsc --noEmit && npx eslint . && npx jest lib/workflow app/api/workflows && npm run build
```
Expected: tsc clean, lint clean, all workflow/run tests pass, production build succeeds.

- [ ] **Step 3: Re-run the end-to-end check from Task 8** (enqueue → succeeded → cleanup) to confirm nothing regressed.

- [ ] **Step 4: Commit**

```bash
git add docs/DEPLOYMENT.md
git commit -m "Workflows: document durable execution + add workflow_runs.sql to migration list"
```

---

## Self-review notes (addressed)

- **Spec coverage:** migration (T1), engine deps (T2), server-runner (T3), worker (T4), instrumentation (T5), trigger API (T6), status/history APIs (T7), integration verify (T8), builder server-run+poll (T9), Runs history UI (T10), AI Agent relabel (T11), docs+verify (T12). All spec sections mapped.
- **Connected-only worker:** guarded in T5 (env check) — desktop standalone never starts it.
- **Type consistency:** `executeRun(run: WorkflowRunRow, client)`, `validateRunBody`, `claim_workflow_run` used identically across tasks. Run status vocab: `queued | running | succeeded | failed` everywhere.
- **Browser path unchanged:** EngineDeps default to current behavior (T2); standalone keeps the client engine (T9).
