# Durable Workflows Phase 2a Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add triggers so a workflow runs without a manual click — on a cron schedule and from a webhook — plus run cancellation.

**Architecture:** A new `lucy.workflow_triggers` table stores a snapshot of the workflow definition. The Phase 1 worker's 3s tick gains a cron pass (`enqueueDueCronTriggers`) that inserts a `queued` run from due triggers; a public secret-gated webhook endpoint enqueues from the snapshot + request body; cancellation uses a `cancel_requested` flag the engine checks between nodes (`canceled` status). Everything reuses Phase 1's "enqueue = insert a queued run" path.

**Tech Stack:** Next.js 16 App Router, TypeScript, Jest (`__tests__/`), self-hosted Supabase (`lucy` schema), `@supabase/supabase-js`, `cron-parser`.

**Spec:** `docs/superpowers/specs/2026-06-24-durable-workflows-phase2a-design.md`

**Conventions:** run `cd C:\RepositoryAI\LucyAI && npx tsc --noEmit` and `npx eslint <changed files>` before each commit (both clean); Jest via `npx jest <path>`. The `.next/dev/types/validator.ts(...) TS2304: Cannot find name 'ts'` error is a stale Next dev-types artifact unrelated to source — ignore it (filter with `| grep -v '.next/dev/types'`).

---

## File map

| File | Responsibility |
|---|---|
| `lib/supabase/workflow_triggers.sql` | NEW — triggers table + RLS + run `cancel_requested` |
| `lib/workflow/cron.ts` (+ test) | NEW — `isValidCron`, `nextRunAfter` |
| `lib/workflow/scheduler.ts` (+ test) | NEW — `enqueueDueCronTriggers` |
| `lib/workflow/worker.ts` | MODIFY — run the cron pass each tick |
| `lib/workflow/engine.ts` | MODIFY — `shouldCancel` hook + `WorkflowCanceledError` |
| `lib/workflow/server-runner.ts` | MODIFY — throttled `shouldCancel`; persist `canceled` |
| `app/api/workflows/triggers/validate.ts` (+ test) | NEW — `validateTriggerBody` |
| `app/api/workflows/triggers/route.ts` | NEW — GET list / POST create |
| `app/api/workflows/triggers/[id]/route.ts` | NEW — PATCH / DELETE |
| `app/api/workflows/triggers/[id]/webhook/route.ts` | NEW — public secret-gated enqueue |
| `app/api/workflows/runs/[runId]/cancel/route.ts` | NEW — cancel a run |
| `components/workflow/TriggersPanel.tsx` | NEW — trigger CRUD UI |
| `components/workflow/RunsHistory.tsx` | MODIFY — cancel button + canceled badge |
| `app/workflows/[id]/page.tsx` | MODIFY — mount TriggersPanel |
| `package.json` | add `cron-parser` |
| `docs/DEPLOYMENT.md` | migration list + Triggers note |

---

## Task 1: Migration — triggers table + run cancellation

**Files:** Create `lib/supabase/workflow_triggers.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Workflow triggers (Phase 2a). Apply to the cloud + dev Supabase as supabase_admin.

create table if not exists lucy.workflow_triggers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  workflow_id uuid,
  name text not null default 'Trigger',
  type text not null check (type in ('cron','webhook')),
  settings jsonb not null default '{}'::jsonb,
  definition jsonb not null,
  inputs jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  secret text,
  next_run_at timestamptz,
  last_enqueued_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_workflow_triggers_user on lucy.workflow_triggers (user_id);
create index if not exists idx_workflow_triggers_cron on lucy.workflow_triggers (type, enabled, next_run_at);

alter table lucy.workflow_triggers enable row level security;
drop policy if exists "own triggers" on lucy.workflow_triggers;
create policy "own triggers" on lucy.workflow_triggers
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Run cancellation
alter table lucy.workflow_runs add column if not exists cancel_requested boolean not null default false;
```

- [ ] **Step 2: Apply to the dev DB**

Run:
```bash
docker exec -i supabase-db psql -U supabase_admin -d postgres < /c/RepositoryAI/LucyAI/lib/supabase/workflow_triggers.sql
```
Expected: `CREATE TABLE`, `CREATE INDEX` ×2, `ALTER TABLE` (rls), `CREATE POLICY`, `ALTER TABLE` (cancel_requested). (`drop policy` may print `NOTICE`/`DROP POLICY`.)

- [ ] **Step 3: Verify**

Run:
```bash
docker exec -i supabase-db psql -U supabase_admin -d postgres -t -c "select count(*) from lucy.workflow_triggers; select column_name from information_schema.columns where table_schema='lucy' and table_name='workflow_runs' and column_name='cancel_requested';"
```
Expected: `0` and `cancel_requested`.

- [ ] **Step 4: Commit**

```bash
cd /c/RepositoryAI/LucyAI
git add lib/supabase/workflow_triggers.sql
git commit -m "Workflows: workflow_triggers table + run cancel_requested column"
```

---

## Task 2: Cron helper — `cron-parser` + `lib/workflow/cron.ts`

**Files:** Create `lib/workflow/cron.ts`, test `lib/workflow/__tests__/cron.test.ts`; modify `package.json`

- [ ] **Step 1: Install cron-parser (v4 — `parseExpression` API)**

Run:
```bash
cd /c/RepositoryAI/LucyAI && npm install cron-parser@^4
```
Expected: adds `cron-parser` to dependencies.

- [ ] **Step 2: Write the failing test**

```ts
// lib/workflow/__tests__/cron.test.ts
import { isValidCron, nextRunAfter } from '../cron';

describe('cron', () => {
  it('validates expressions', () => {
    expect(isValidCron('0 9 * * *')).toBe(true);
    expect(isValidCron('totally not cron')).toBe(false);
  });

  it('computes the next run strictly after the given date', () => {
    const after = new Date('2026-01-01T08:00:00.000Z');
    const next = nextRunAfter('0 9 * * *', after, 'UTC');
    expect(next?.toISOString()).toBe('2026-01-01T09:00:00.000Z');
  });

  it('returns null for an invalid expression', () => {
    expect(nextRunAfter('nope', new Date('2026-01-01T00:00:00Z'))).toBeNull();
  });
});
```

- [ ] **Step 3: Run it — expect FAIL** (`Cannot find module '../cron'`)

Run: `npx jest lib/workflow/__tests__/cron.test.ts`

- [ ] **Step 4: Implement `cron.ts`**

```ts
// lib/workflow/cron.ts
/** Cron validation + next-run computation (thin wrapper over cron-parser v4). */
import { parseExpression } from 'cron-parser';

export function isValidCron(expr: string): boolean {
  try {
    parseExpression(expr);
    return true;
  } catch {
    return false;
  }
}

/** Next fire time strictly after `after`, or null if the expression is invalid. */
export function nextRunAfter(expr: string, after: Date, timezone?: string): Date | null {
  try {
    const it = parseExpression(expr, { currentDate: after, tz: timezone });
    return it.next().toDate();
  } catch {
    return null;
  }
}
```

> If tsc reports no exported `parseExpression` (version drift), use `import parser from 'cron-parser'` + `parser.parseExpression(...)` instead — pick whichever the installed version exports; do not change the function signatures.

- [ ] **Step 5: Run the test — expect PASS**

Run: `npx jest lib/workflow/__tests__/cron.test.ts`

- [ ] **Step 6: tsc + lint + commit**

```bash
npx tsc --noEmit 2>&1 | grep -v '.next/dev/types' | grep 'error TS'   # expect no output
npx eslint lib/workflow/cron.ts lib/workflow/__tests__/cron.test.ts
git add lib/workflow/cron.ts lib/workflow/__tests__/cron.test.ts package.json package-lock.json
git commit -m "Workflows: cron helper (isValidCron, nextRunAfter) via cron-parser"
```

---

## Task 3: Scheduler — `enqueueDueCronTriggers`

**Files:** Create `lib/workflow/scheduler.ts`, test `lib/workflow/__tests__/scheduler.test.ts`

- [ ] **Step 1: Write the failing test (fake client)**

```ts
// lib/workflow/__tests__/scheduler.test.ts
import { enqueueDueCronTriggers } from '../scheduler';

interface Recorded { inserts: Record<string, unknown>[]; updates: Record<string, unknown>[] }

// Minimal fake of the supabase client surface enqueueDueCronTriggers uses.
function fakeClient(triggers: unknown[], rec: Recorded) {
  return {
    from(table: string) {
      if (table === 'workflow_triggers') {
        const chain: Record<string, unknown> = {
          select: () => chain, eq: () => chain,
          or: async () => ({ data: triggers, error: null }),
          update: (patch: Record<string, unknown>) => ({ eq: async () => { rec.updates.push(patch); return { error: null }; } }),
        };
        return chain;
      }
      // workflow_runs
      return { insert: async (row: Record<string, unknown>) => { rec.inserts.push(row); return { error: null }; } };
    },
  } as never;
}

const due = {
  id: 't1', user_id: 'u1', workflow_id: null, name: 'Nightly',
  settings: { expr: '0 9 * * *', timezone: 'UTC' },
  definition: { name: 'Nightly', nodes: [], edges: [] }, inputs: { a: '1' },
};

describe('enqueueDueCronTriggers', () => {
  it('enqueues a queued run from a due trigger and advances next_run_at', async () => {
    const rec: Recorded = { inserts: [], updates: [] };
    const now = new Date('2026-01-01T08:00:00.000Z');
    const n = await enqueueDueCronTriggers(fakeClient([due], rec), now);
    expect(n).toBe(1);
    expect(rec.inserts).toHaveLength(1);
    expect(rec.inserts[0]).toMatchObject({ user_id: 'u1', status: 'queued', trigger: 'cron', inputs: { a: '1' } });
    expect(rec.updates).toHaveLength(1);
    expect(rec.updates[0].next_run_at).toBe('2026-01-01T09:00:00.000Z');
    expect(rec.updates[0].last_enqueued_at).toBe(now.toISOString());
  });

  it('does nothing when no triggers are due', async () => {
    const rec: Recorded = { inserts: [], updates: [] };
    const n = await enqueueDueCronTriggers(fakeClient([], rec), new Date('2026-01-01T08:00:00.000Z'));
    expect(n).toBe(0);
    expect(rec.inserts).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`Cannot find module '../scheduler'`)

Run: `npx jest lib/workflow/__tests__/scheduler.test.ts`

- [ ] **Step 3: Implement `scheduler.ts`**

```ts
// lib/workflow/scheduler.ts
/**
 * Cron pass for the workflow worker. Enqueues a queued run for every due cron
 * trigger (from its definition snapshot) and advances next_run_at. Reuses the
 * Phase 1 "enqueue = insert a workflow_runs row" path.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { nextRunAfter } from './cron';

interface CronTriggerRow {
  id: string;
  user_id: string;
  workflow_id: string | null;
  name: string;
  settings: { expr?: string; timezone?: string } | null;
  definition: unknown;
  inputs: Record<string, string> | null;
}

export async function enqueueDueCronTriggers(client: SupabaseClient, now: Date = new Date()): Promise<number> {
  const iso = now.toISOString();
  const { data, error } = await client
    .from('workflow_triggers')
    .select('id, user_id, workflow_id, name, settings, definition, inputs')
    .eq('type', 'cron')
    .eq('enabled', true)
    .or(`next_run_at.is.null,next_run_at.lte.${iso}`);
  if (error || !data) return 0;

  let count = 0;
  for (const t of data as CronTriggerRow[]) {
    const expr = t.settings?.expr;
    if (!expr) continue;

    const { error: insErr } = await client.from('workflow_runs').insert({
      user_id: t.user_id,
      workflow_id: t.workflow_id,
      name: t.name,
      definition: t.definition,
      inputs: t.inputs ?? {},
      status: 'queued',
      enqueued_at: iso,
      trigger: 'cron',
    });
    if (insErr) continue;

    const next = nextRunAfter(expr, now, t.settings?.timezone);
    await client
      .from('workflow_triggers')
      .update({ next_run_at: next ? next.toISOString() : null, last_enqueued_at: iso })
      .eq('id', t.id);
    count++;
  }
  return count;
}
```

- [ ] **Step 4: Run the test — expect PASS**

Run: `npx jest lib/workflow/__tests__/scheduler.test.ts`

- [ ] **Step 5: tsc + lint + commit**

```bash
npx tsc --noEmit 2>&1 | grep -v '.next/dev/types' | grep 'error TS'
npx eslint lib/workflow/scheduler.ts lib/workflow/__tests__/scheduler.test.ts
git add lib/workflow/scheduler.ts lib/workflow/__tests__/scheduler.test.ts
git commit -m "Workflows: enqueueDueCronTriggers (cron scheduler pass)"
```

---

## Task 4: Worker — run the cron pass each tick

**Files:** Modify `lib/workflow/worker.ts`

- [ ] **Step 1: Add the import**

At the top of `lib/workflow/worker.ts`, after the existing imports:

```ts
import { enqueueDueCronTriggers } from './scheduler';
```

- [ ] **Step 2: Call the scheduler before draining the queue**

In `worker.ts`, inside `tick`, replace the `try { ... }` body so the cron pass runs first:

```ts
  const tick = async (): Promise<void> => {
    try {
      // 1) Enqueue any due cron triggers (so they run this same tick).
      await enqueueDueCronTriggers(client);
      // 2) Drain all currently-queued runs, one at a time.
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
```

- [ ] **Step 3: tsc + lint + commit**

```bash
npx tsc --noEmit 2>&1 | grep -v '.next/dev/types' | grep 'error TS'
npx eslint lib/workflow/worker.ts
git add lib/workflow/worker.ts
git commit -m "Workflows: worker tick enqueues due cron triggers"
```

---

## Task 5: Cancellation — engine hook + server-runner

**Files:** Modify `lib/workflow/engine.ts`, `lib/workflow/server-runner.ts`; test `lib/workflow/__tests__/engine-cancel.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/workflow/__tests__/engine-cancel.test.ts
import { WorkflowEngine, WorkflowCanceledError } from '../engine';
import type { Workflow } from '../types';

jest.mock('@/lib/providers', () => ({ getProvider: () => ({ chat: async () => {} }), getModelsByProvider: () => ({}) }));
jest.mock('@/lib/integrations/actions', () => ({ executeAction: async () => ({ success: true }) }));
jest.mock('@/lib/supabase/client', () => ({ getSupabaseClient: () => null }));

function twoStep(): Workflow {
  return {
    id: 'w', name: 'c', description: '', isPublished: false, createdAt: 0, updatedAt: 0,
    nodes: [
      { id: 'start', type: 'start', position: { x: 0, y: 0 }, data: { nodeType: 'start', label: 'Start', config: { inputVariables: [{ name: 'user_query', description: '', defaultValue: '' }] } } },
      { id: 'out', type: 'output', position: { x: 0, y: 0 }, data: { nodeType: 'output', label: 'Out', config: { displayName: 'R', format: 'text' } } },
    ],
    edges: [{ id: 'e', source: 'start', target: 'out' }],
  };
}

describe('engine shouldCancel', () => {
  it('throws WorkflowCanceledError when shouldCancel returns true', async () => {
    const engine = new WorkflowEngine(twoStep(), { shouldCancel: () => true });
    const result = await engine.execute({ user_query: 'x' }, {});
    expect(result.status).toBe('error');
    expect(result.error).toMatch(/cancel/i);
  });

  it('runs normally when shouldCancel is absent', async () => {
    const engine = new WorkflowEngine(twoStep(), {});
    const result = await engine.execute({ user_query: 'hi' }, {});
    expect(result.status).toBe('completed');
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (no `WorkflowCanceledError` export / no cancel behavior)

Run: `npx jest lib/workflow/__tests__/engine-cancel.test.ts`

- [ ] **Step 3: Add the hook to `engine.ts`**

Add the error class near the top of `lib/workflow/engine.ts` (after the imports):

```ts
/** Thrown by the engine when a run is canceled mid-execution. */
export class WorkflowCanceledError extends Error {
  constructor(message = 'Workflow canceled') {
    super(message);
    this.name = 'WorkflowCanceledError';
  }
}
```

In the `EngineCallbacks` interface, add:

```ts
  /** Polled at each node; if it returns true the run is canceled (throws). */
  shouldCancel?: () => boolean | Promise<boolean>;
```

In `executeNode`, immediately after `visitedIds.add(node.id);`:

```ts
    if (await this.callbacks.shouldCancel?.()) {
      throw new WorkflowCanceledError();
    }
```

(`execute()` already catches a throw and returns `{ status: 'error', error: err.message, ... }`, so the canceled message surfaces in `result.error`.)

- [ ] **Step 4: Run the engine test — expect PASS**

Run: `npx jest lib/workflow/__tests__/engine-cancel.test.ts`

- [ ] **Step 5: Wire server-runner to provide `shouldCancel` + persist `canceled`**

In `lib/workflow/server-runner.ts`, change the engine import:

```ts
import { WorkflowEngine, WorkflowCanceledError } from './engine';
```

Add a throttled cancel check before constructing the engine (after the `flush` definition, before `const engine = ...`):

```ts
  // Throttled cancel check (reads workflow_runs.cancel_requested at most every 2s).
  let lastCancelCheck = 0;
  let cachedCancel = false;
  const shouldCancel = async (): Promise<boolean> => {
    const now = Date.now();
    if (now - lastCancelCheck < 2000) return cachedCancel;
    lastCancelCheck = now;
    const { data } = await client.from('workflow_runs').select('cancel_requested').eq('id', run.id).single();
    cachedCancel = Boolean((data as { cancel_requested?: boolean } | null)?.cancel_requested);
    return cachedCancel;
  };
```

Pass it into the engine callbacks:

```ts
  const engine = new WorkflowEngine(
    run.definition,
    { onLog: (e) => { logs.push(e); void flush(); }, shouldCancel },
    deps
  );
```

Replace the `catch (err)` block so a cancel persists `canceled`:

```ts
  } catch (err) {
    const canceled = err instanceof WorkflowCanceledError;
    await client.from('workflow_runs').update({
      status: canceled ? 'canceled' : 'failed',
      error: canceled ? null : (err instanceof Error ? err.message : String(err)),
      logs,
      completed_at: new Date().toISOString(),
    }).eq('id', run.id);
  }
```

- [ ] **Step 6: tsc + lint + full workflow tests + commit**

```bash
npx tsc --noEmit 2>&1 | grep -v '.next/dev/types' | grep 'error TS'
npx eslint lib/workflow/engine.ts lib/workflow/server-runner.ts lib/workflow/__tests__/engine-cancel.test.ts
npx jest lib/workflow
git add lib/workflow/engine.ts lib/workflow/server-runner.ts lib/workflow/__tests__/engine-cancel.test.ts
git commit -m "Workflows: cancellation hook (shouldCancel + WorkflowCanceledError + canceled status)"
```

---

## Task 6: Trigger CRUD API

**Files:** Create `app/api/workflows/triggers/validate.ts`, test `app/api/workflows/__tests__/trigger-validation.test.ts`, `app/api/workflows/triggers/route.ts`, `app/api/workflows/triggers/[id]/route.ts`

- [ ] **Step 1: Write the failing validator test**

```ts
// app/api/workflows/__tests__/trigger-validation.test.ts
import { validateTriggerBody } from '../triggers/validate';

const def = { name: 'W', nodes: [{ data: { nodeType: 'start' } }], edges: [] };

describe('validateTriggerBody', () => {
  it('rejects an unknown type', () => {
    expect(validateTriggerBody({ type: 'sms', definition: def }).ok).toBe(false);
  });
  it('rejects a cron type with a bad expression', () => {
    expect(validateTriggerBody({ type: 'cron', settings: { expr: 'nope' }, definition: def }).ok).toBe(false);
  });
  it('accepts a valid cron trigger', () => {
    const r = validateTriggerBody({ type: 'cron', settings: { expr: '0 9 * * *' }, definition: def });
    expect(r.ok).toBe(true);
  });
  it('accepts a webhook trigger', () => {
    const r = validateTriggerBody({ type: 'webhook', definition: def });
    expect(r.ok).toBe(true);
  });
  it('rejects a definition without a start node', () => {
    expect(validateTriggerBody({ type: 'webhook', definition: { name: 'x', nodes: [], edges: [] } }).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`Cannot find module '../triggers/validate'`)

Run: `npx jest app/api/workflows/__tests__/trigger-validation.test.ts`

- [ ] **Step 3: Implement the validator**

```ts
// app/api/workflows/triggers/validate.ts
import { isValidCron } from '@/lib/workflow/cron';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface DefNode { data?: { nodeType?: string } }
interface Def { name?: unknown; nodes?: unknown; edges?: unknown }

export interface ValidTrigger {
  ok: true;
  name: string;
  type: 'cron' | 'webhook';
  settings: Record<string, unknown>;
  definition: { name: string; nodes: DefNode[]; edges: unknown[] };
  inputs: Record<string, string>;
  workflowId: string | null;
}
export type TriggerValidateResult = ValidTrigger | { ok: false; status: number; error: string };

export function validateTriggerBody(body: unknown): TriggerValidateResult {
  const b = body as { workflowId?: unknown; name?: unknown; type?: unknown; settings?: Record<string, unknown>; definition?: Def; inputs?: unknown } | null;
  const type = b?.type;
  if (type !== 'cron' && type !== 'webhook') return { ok: false, status: 400, error: 'type must be cron or webhook' };

  const def = b?.definition;
  if (!def || !Array.isArray(def.nodes)) return { ok: false, status: 400, error: 'Missing definition' };
  if (def.nodes.length > 500) return { ok: false, status: 413, error: 'Workflow too large' };
  if (!(def.nodes as DefNode[]).some((n) => n?.data?.nodeType === 'start')) {
    return { ok: false, status: 400, error: 'Workflow needs a Start node' };
  }

  const settings = (b?.settings && typeof b.settings === 'object' ? b.settings : {}) as Record<string, unknown>;
  if (type === 'cron') {
    const expr = typeof settings.expr === 'string' ? settings.expr : '';
    if (!isValidCron(expr)) return { ok: false, status: 400, error: 'Invalid cron expression' };
  }

  return {
    ok: true,
    name: typeof b?.name === 'string' && b.name.trim() ? b.name.trim() : (typeof def.name === 'string' ? def.name : 'Trigger'),
    type,
    settings,
    definition: { name: typeof def.name === 'string' ? def.name : 'Workflow', nodes: def.nodes as DefNode[], edges: Array.isArray(def.edges) ? def.edges : [] },
    inputs: (b?.inputs && typeof b.inputs === 'object' ? b.inputs : {}) as Record<string, string>,
    workflowId: typeof b?.workflowId === 'string' && UUID_RE.test(b.workflowId) ? b.workflowId : null,
  };
}
```

- [ ] **Step 4: Run the validator test — expect PASS**

Run: `npx jest app/api/workflows/__tests__/trigger-validation.test.ts`

- [ ] **Step 5: Implement the list/create route**

```ts
// app/api/workflows/triggers/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { resolveMemoryAuth } from '@/lib/memory/auth';
import { nextRunAfter } from '@/lib/workflow/cron';
import { validateTriggerBody } from './validate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { userId, client } = await resolveMemoryAuth(req);
  if (!userId || !client) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const workflowId = req.nextUrl.searchParams.get('workflowId');

  let q = client
    .from('workflow_triggers')
    .select('id, workflow_id, name, type, settings, enabled, secret, next_run_at, last_enqueued_at, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (workflowId) q = q.eq('workflow_id', workflowId);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ triggers: data ?? [] });
}

export async function POST(req: NextRequest) {
  const { userId, client } = await resolveMemoryAuth(req);
  if (!userId || !client) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const v = validateTriggerBody(await req.json().catch(() => null));
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: v.status });

  const row: Record<string, unknown> = {
    user_id: userId,
    workflow_id: v.workflowId,
    name: v.name,
    type: v.type,
    settings: v.settings,
    definition: v.definition,
    inputs: v.inputs,
    enabled: true,
  };
  if (v.type === 'cron') {
    row.next_run_at = nextRunAfter(String(v.settings.expr), new Date())?.toISOString() ?? null;
  }
  if (v.type === 'webhook') {
    row.secret = randomBytes(24).toString('base64url');
  }

  const { data, error } = await client.from('workflow_triggers').insert(row).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ trigger: data });
}
```

- [ ] **Step 6: Implement the patch/delete route**

```ts
// app/api/workflows/triggers/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { resolveMemoryAuth } from '@/lib/memory/auth';
import { isValidCron, nextRunAfter } from '@/lib/workflow/cron';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId, client } = await resolveMemoryAuth(req);
  if (!userId || !client) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as
    | { enabled?: boolean; name?: string; settings?: { expr?: string; timezone?: string }; definition?: unknown }
    | null;
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;
  if (typeof body.name === 'string') patch.name = body.name;
  if (body.definition) patch.definition = body.definition;
  if (body.settings) {
    patch.settings = body.settings;
    if (typeof body.settings.expr === 'string') {
      if (!isValidCron(body.settings.expr)) return NextResponse.json({ error: 'Invalid cron expression' }, { status: 400 });
      patch.next_run_at = nextRunAfter(body.settings.expr, new Date(), body.settings.timezone)?.toISOString() ?? null;
    }
  }

  const { data, error } = await client
    .from('workflow_triggers')
    .update(patch)
    .eq('id', id)
    .eq('user_id', userId)
    .select('id, name, type, settings, enabled, next_run_at')
    .single();
  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ trigger: data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId, client } = await resolveMemoryAuth(req);
  if (!userId || !client) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const { error } = await client.from('workflow_triggers').delete().eq('id', id).eq('user_id', userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 7: tsc + lint + commit**

```bash
npx tsc --noEmit 2>&1 | grep -v '.next/dev/types' | grep 'error TS'
npx eslint app/api/workflows/triggers/validate.ts app/api/workflows/triggers/route.ts "app/api/workflows/triggers/[id]/route.ts" app/api/workflows/__tests__/trigger-validation.test.ts
git add app/api/workflows/triggers/validate.ts app/api/workflows/triggers/route.ts "app/api/workflows/triggers/[id]/route.ts" app/api/workflows/__tests__/trigger-validation.test.ts
git commit -m "Workflows: trigger CRUD API (list/create/update/delete)"
```

---

## Task 7: Webhook endpoint

**Files:** Create `app/api/workflows/triggers/[id]/webhook/route.ts`

- [ ] **Step 1: Implement the route (public, secret-gated, CORS like /api/sync/push)**

```ts
// app/api/workflows/triggers/[id]/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit, getClientIp } from '@/lib/api/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, x-webhook-token',
  'Access-Control-Max-Age': '86400',
};
const json = (b: unknown, status = 200) => NextResponse.json(b, { status, headers: CORS });

function service() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { db: { schema: 'lucy' } });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rl = checkRateLimit('wf-webhook', getClientIp(req), 60);
  if (rl.limited) return json({ error: 'Rate limited' }, 429);

  const svc = service();
  if (!svc) return json({ error: 'Service unavailable' }, 503);

  const { data: trigger } = await svc
    .from('workflow_triggers')
    .select('id, user_id, workflow_id, name, definition, inputs, enabled, secret, type')
    .eq('id', id)
    .single();

  const token = req.nextUrl.searchParams.get('token') || req.headers.get('x-webhook-token') || '';
  if (!trigger || trigger.type !== 'webhook' || !trigger.enabled || !trigger.secret || token !== trigger.secret) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const inputs = { ...(trigger.inputs as Record<string, unknown>), ...(body && typeof body === 'object' ? body : {}) };

  const { data, error } = await svc.from('workflow_runs').insert({
    user_id: trigger.user_id,
    workflow_id: trigger.workflow_id,
    name: trigger.name,
    definition: trigger.definition,
    inputs,
    status: 'queued',
    enqueued_at: new Date().toISOString(),
    trigger: 'webhook',
  }).select('id').single();

  if (error) return json({ error: 'Could not enqueue' }, 500);
  return json({ runId: data.id });
}
```

- [ ] **Step 2: tsc + lint + commit**

```bash
npx tsc --noEmit 2>&1 | grep -v '.next/dev/types' | grep 'error TS'
npx eslint "app/api/workflows/triggers/[id]/webhook/route.ts"
git add "app/api/workflows/triggers/[id]/webhook/route.ts"
git commit -m "Workflows: webhook trigger endpoint (secret-gated enqueue)"
```

---

## Task 8: Cancel endpoint

**Files:** Create `app/api/workflows/runs/[runId]/cancel/route.ts`

- [ ] **Step 1: Implement**

```ts
// app/api/workflows/runs/[runId]/cancel/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { resolveMemoryAuth } from '@/lib/memory/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const { userId, client } = await resolveMemoryAuth(req);
  if (!userId || !client) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { runId } = await params;

  const { data: run } = await client
    .from('workflow_runs')
    .select('id, status')
    .eq('id', runId)
    .eq('user_id', userId)
    .single();
  if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (run.status === 'queued') {
    await client.from('workflow_runs')
      .update({ status: 'canceled', completed_at: new Date().toISOString() })
      .eq('id', runId).eq('user_id', userId);
    return NextResponse.json({ status: 'canceled' });
  }
  if (run.status === 'running') {
    await client.from('workflow_runs')
      .update({ cancel_requested: true })
      .eq('id', runId).eq('user_id', userId);
    return NextResponse.json({ status: 'canceling' });
  }
  return NextResponse.json({ status: run.status });
}
```

- [ ] **Step 2: tsc + lint + commit**

```bash
npx tsc --noEmit 2>&1 | grep -v '.next/dev/types' | grep 'error TS'
npx eslint "app/api/workflows/runs/[runId]/cancel/route.ts"
git add "app/api/workflows/runs/[runId]/cancel/route.ts"
git commit -m "Workflows: cancel run endpoint"
```

---

## Task 9: Live integration check (dev worker)

Before the UI, prove triggers + cancel end-to-end (no commit).

- [ ] **Step 1: Start a fresh dev server with the worker**

```bash
# free 3001 if needed, then:
cd /c/RepositoryAI/LucyAI && npm run dev   # run_in_background; wait for "[workflow-worker] started" and http://localhost:3001/api/models == 200
```

- [ ] **Step 2a: Create a cron trigger + a webhook trigger; fire the webhook**

```bash
node -e '
const os=require("os"); const cfg=require(os.homedir()+"/.lucy/config.json"); const key=cfg.apiKey;
const H={ "Content-Type":"application/json", Authorization:"Bearer "+key };
const definition={ name:"trig-verify", nodes:[
  {id:"start",type:"start",position:{x:0,y:0},data:{nodeType:"start",label:"Start",config:{inputVariables:[{name:"user_query",description:"",defaultValue:""}]}}},
  {id:"t",type:"transform",position:{x:0,y:0},data:{nodeType:"transform",label:"T",config:{operation:"uppercase"}}},
  {id:"out",type:"output",position:{x:0,y:0},data:{nodeType:"output",label:"Out",config:{displayName:"R",format:"text"}}}
], edges:[{id:"e1",source:"start",target:"t"},{id:"e2",source:"t",target:"out"}]};
const base="http://localhost:3001";
(async()=>{
  const c=await fetch(base+"/api/workflows/triggers",{method:"POST",headers:H,body:JSON.stringify({name:"trig-verify",type:"cron",settings:{expr:"* * * * *"},definition,inputs:{user_query:"cronhi"}})});
  console.log("cron trigger create:",c.status, (await c.json()).trigger?.id);
  const w=await fetch(base+"/api/workflows/triggers",{method:"POST",headers:H,body:JSON.stringify({name:"trig-verify-wh",type:"webhook",definition,inputs:{user_query:"whdefault"}})});
  const wj=await w.json(); console.log("webhook trigger create:",w.status, wj.trigger?.id);
  const hook=await fetch(base+"/api/workflows/triggers/"+wj.trigger.id+"/webhook?token="+wj.trigger.secret,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({user_query:"whoverride"})});
  console.log("webhook enqueue:",hook.status, JSON.stringify(await hook.json()));
})();
'
```
Expected: cron trigger 200 (id), webhook trigger 200 (id), `webhook enqueue: 200 {"runId":...}`.

- [ ] **Step 2b: Force the cron trigger due (deterministic — a fresh `* * * * *` trigger is up to 60s out)**

```bash
docker exec -i supabase-db psql -U supabase_admin -d postgres -c "update lucy.workflow_triggers set next_run_at = now() - interval '1 minute' where name='trig-verify';"
```
Expected: `UPDATE 1`. Within one worker tick (~3s) the cron pass enqueues a run.

- [ ] **Step 2c: Confirm both the cron and webhook runs reached `succeeded`**

```bash
node -e '
const os=require("os"); const cfg=require(os.homedir()+"/.lucy/config.json"); const key=cfg.apiKey;
const H={ Authorization:"Bearer "+cfg.apiKey };
async function poll(name){ for(let i=0;i<15;i++){ await new Promise(s=>setTimeout(s,1000));
  const g=await fetch("http://localhost:3001/api/workflows/runs?limit=10",{headers:H}); const {runs}=await g.json();
  const r=runs.find(x=>x.name===name && (x.status==="succeeded"||x.status==="failed")); if(r) return r.status; } return "timeout"; }
(async()=>{ console.log("cron run ->", await poll("trig-verify")); console.log("webhook run ->", await poll("trig-verify-wh")); })();
'
```
Expected: `cron run -> succeeded` and `webhook run -> succeeded`.

- [ ] **Step 3: Cancel a queued run**

```bash
node -e '
const os=require("os"); const cfg=require(os.homedir()+"/.lucy/config.json"); const key=cfg.apiKey;
const H={ "Content-Type":"application/json", Authorization:"Bearer "+key };
const definition={ name:"cancel-verify", nodes:[{id:"start",type:"start",position:{x:0,y:0},data:{nodeType:"start",label:"S",config:{inputVariables:[]}}}], edges:[] };
(async()=>{
  const r=await fetch("http://localhost:3001/api/workflows/run",{method:"POST",headers:H,body:JSON.stringify({definition,inputs:{}})});
  const {runId}=await r.json();
  const c=await fetch("http://localhost:3001/api/workflows/runs/"+runId+"/cancel",{method:"POST",headers:H});
  console.log("cancel ->", c.status, JSON.stringify(await c.json()));
})();
'
```
Expected: `cancel -> 200 {"status":"canceled"}` (or `canceling` if the worker already claimed it — both acceptable).

- [ ] **Step 4: Clean up the test rows**

```bash
docker exec -i supabase-db psql -U supabase_admin -d postgres -c "delete from lucy.workflow_runs where name in ('trig-verify','trig-verify-wh','cancel-verify'); delete from lucy.workflow_triggers where name in ('trig-verify','trig-verify-wh');"
```

If any step fails, fix the owning task before continuing.

---

## Task 10: UI — Triggers panel + cancel button

**Files:** Create `components/workflow/TriggersPanel.tsx`; modify `components/workflow/RunsHistory.tsx`, `app/workflows/[id]/page.tsx`

- [ ] **Step 1: Implement `TriggersPanel.tsx`**

```tsx
// components/workflow/TriggersPanel.tsx
'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { X, Clock, Webhook, Trash2, Plus, Copy } from 'lucide-react';

const CRON_PRESETS: { label: string; expr: string }[] = [
  { label: 'Every hour', expr: '0 * * * *' },
  { label: 'Every day at 09:00', expr: '0 9 * * *' },
  { label: 'Every Monday at 09:00', expr: '0 9 * * 1' },
  { label: 'Custom…', expr: '' },
];

interface Trigger {
  id: string; name: string; type: 'cron' | 'webhook';
  settings: { expr?: string }; enabled: boolean; secret: string | null; next_run_at: string | null;
}

interface Props {
  workflowId: string;
  definition: { name: string; nodes: unknown[]; edges: unknown[] };
  onClose: () => void;
}

export function TriggersPanel({ workflowId, definition, onClose }: Props) {
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [adding, setAdding] = useState<'cron' | 'webhook' | null>(null);
  const [cron, setCron] = useState('0 9 * * *');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/workflows/triggers?workflowId=${encodeURIComponent(workflowId)}`);
    if (res.ok) setTriggers((await res.json()).triggers ?? []);
  }, [workflowId]);
  useEffect(() => { load(); }, [load]);

  const create = async (type: 'cron' | 'webhook') => {
    setBusy(true); setErr(null);
    try {
      const body: Record<string, unknown> = { workflowId, type, definition, name: definition.name || 'Trigger' };
      if (type === 'cron') body.settings = { expr: cron };
      const res = await fetch('/api/workflows/triggers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { setErr(data?.error || 'Failed'); return; }
      setAdding(null); await load();
    } finally { setBusy(false); }
  };

  const toggle = async (t: Trigger) => {
    await fetch(`/api/workflows/triggers/${t.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: !t.enabled }) });
    load();
  };
  const remove = async (t: Trigger) => {
    await fetch(`/api/workflows/triggers/${t.id}`, { method: 'DELETE' });
    load();
  };

  const webhookUrl = (t: Trigger) => {
    const base = process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== 'undefined' ? window.location.origin : '');
    return `${base}/api/workflows/triggers/${t.id}/webhook?token=${t.secret ?? ''}`;
  };

  return (
    <div className="absolute right-0 top-0 h-full w-96 bg-gray-900 border-l border-gray-800 flex flex-col z-20">
      <div className="flex items-center justify-between px-4 h-10 border-b border-gray-800 shrink-0">
        <span className="text-xs font-medium text-gray-300">Triggers</span>
        <button onClick={onClose} className="text-gray-600 hover:text-gray-300"><X className="w-4 h-4" /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {triggers.length === 0 && !adding && (
          <p className="text-xs text-gray-600">No triggers. Add one to run this workflow automatically.</p>
        )}
        {triggers.map((t) => (
          <div key={t.id} className="rounded-lg border border-gray-800 bg-gray-800/40 p-2.5 text-xs space-y-1.5">
            <div className="flex items-center gap-2">
              {t.type === 'cron' ? <Clock className="w-3.5 h-3.5 text-lucy-400" /> : <Webhook className="w-3.5 h-3.5 text-lucy-400" />}
              <span className="text-gray-200 flex-1 truncate">{t.type === 'cron' ? `cron: ${t.settings?.expr}` : 'webhook'}</span>
              <button onClick={() => toggle(t)} className={t.enabled ? 'text-emerald-400' : 'text-gray-500'}>{t.enabled ? 'on' : 'off'}</button>
              <button onClick={() => remove(t)} className="text-gray-500 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
            {t.type === 'webhook' && (
              <button onClick={() => navigator.clipboard.writeText(webhookUrl(t))} className="flex items-center gap-1 text-lucy-400 hover:text-lucy-300">
                <Copy className="w-3 h-3" /> Copy webhook URL
              </button>
            )}
            {t.type === 'cron' && t.next_run_at && <p className="text-gray-600">next: {new Date(t.next_run_at).toLocaleString()}</p>}
          </div>
        ))}

        {adding === 'cron' && (
          <div className="rounded-lg border border-gray-700 bg-gray-800 p-2.5 space-y-2">
            <select value={CRON_PRESETS.some((p) => p.expr === cron) ? cron : ''} onChange={(e) => e.target.value && setCron(e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200">
              {CRON_PRESETS.map((p) => <option key={p.label} value={p.expr}>{p.label}</option>)}
            </select>
            <input value={cron} onChange={(e) => setCron(e.target.value)} placeholder="0 9 * * *" className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 font-mono" />
            {err && <p className="text-red-400 text-xs">{err}</p>}
            <div className="flex gap-2">
              <button disabled={busy} onClick={() => create('cron')} className="px-2 py-1 rounded bg-lucy-600 text-white text-xs disabled:opacity-50">Add schedule</button>
              <button onClick={() => setAdding(null)} className="px-2 py-1 text-gray-400 text-xs">Cancel</button>
            </div>
          </div>
        )}
      </div>
      <div className="border-t border-gray-800 p-2 flex gap-2">
        <button onClick={() => { setAdding('cron'); setErr(null); }} className="flex items-center gap-1 text-xs px-2 py-1 rounded text-gray-300 hover:bg-gray-800"><Plus className="w-3 h-3" /><Clock className="w-3 h-3" /> Schedule</button>
        <button disabled={busy} onClick={() => create('webhook')} className="flex items-center gap-1 text-xs px-2 py-1 rounded text-gray-300 hover:bg-gray-800"><Plus className="w-3 h-3" /><Webhook className="w-3 h-3" /> Webhook</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add a Cancel button + `canceled` badge to `RunsHistory.tsx`**

In `components/workflow/RunsHistory.tsx`, extend `statusIcon` to handle `canceled` (reuse the failed/grey style) and add a Cancel control for `queued`/`running` rows. Add this handler inside the component:

```tsx
const cancelRun = async (id: string) => {
  await fetch(`/api/workflows/runs/${id}/cancel`, { method: 'POST' });
  load();
};
```
And in each run row, when `r.status === 'queued' || r.status === 'running'`, render a small button:
```tsx
<button onClick={() => cancelRun(r.id)} className="text-gray-500 hover:text-red-400">cancel</button>
```
Map `canceled` in the status icon to a grey `Circle`/`X` so it renders distinctly. (Read the file first and mirror its existing row markup + `statusIcon`.)

- [ ] **Step 3: Mount the Triggers panel in the builder**

In `app/workflows/[id]/page.tsx`: add `import { TriggersPanel } from '@/components/workflow/TriggersPanel';`, a `const [showTriggers, setShowTriggers] = useState(false);`, a toolbar/header button "Triggers" that toggles it, and render (inside the same `relative` container as `RunsHistory`):

```tsx
{showTriggers && (
  <TriggersPanel
    workflowId={workflowId || id}
    definition={{ name: workflowName, nodes, edges }}
    onClose={() => setShowTriggers(false)}
  />
)}
```

- [ ] **Step 4: tsc + lint + manual check**

```bash
npx tsc --noEmit 2>&1 | grep -v '.next/dev/types' | grep 'error TS'
npx eslint components/workflow/TriggersPanel.tsx components/workflow/RunsHistory.tsx "app/workflows/[id]/page.tsx"
```
Open `http://localhost:3001/workflows/<id>` → **Triggers** → add a daily schedule and a webhook (copy its URL); add a cron `* * * * *` and watch a run appear in **Runs**; cancel a run.

- [ ] **Step 5: Commit**

```bash
git add components/workflow/TriggersPanel.tsx components/workflow/RunsHistory.tsx "app/workflows/[id]/page.tsx"
git commit -m "Workflows: Triggers panel (schedule + webhook) + run cancel button"
```

---

## Task 11: Docs + full verification sweep

**Files:** Modify `docs/DEPLOYMENT.md`

- [ ] **Step 1: Update docs**

In `docs/DEPLOYMENT.md` Section 2 migration list, after `workflow_runs.sql`:
```markdown
- `lib/supabase/workflow_triggers.sql` — workflow triggers (schedule + webhook) + run cancellation
```
And extend the `## 12. Workflows (durable execution)` section with a paragraph:
```markdown
**Triggers (Phase 2a):** workflows can run on a **cron schedule** or from a
**webhook**. Triggers are rows in `lucy.workflow_triggers` storing a definition
snapshot; the worker tick enqueues due cron runs, and
`POST /api/workflows/triggers/<id>/webhook?token=<secret>` enqueues from a request
body. Runs can be canceled (queued → immediate, running → at the next node).
Requires `lib/supabase/workflow_triggers.sql`. Record-event triggers are Phase 2b.
```

- [ ] **Step 2: Full sweep**

```bash
cd /c/RepositoryAI/LucyAI
npx tsc --noEmit 2>&1 | grep -v '.next/dev/types' | grep 'error TS'   # expect no output
npx eslint .
npx jest lib/workflow app/api/workflows
npm run build
```
Expected: tsc clean, lint clean, all tests pass, build succeeds (new routes `/api/workflows/triggers`, `/api/workflows/triggers/[id]`, `/api/workflows/triggers/[id]/webhook`, `/api/workflows/runs/[runId]/cancel` in the route table).

- [ ] **Step 3: Re-run Task 9's live checks** to confirm no regression, then commit.

```bash
git add docs/DEPLOYMENT.md
git commit -m "Workflows: document triggers (schedule + webhook + cancel) + migration"
```

---

## Self-review notes (addressed)

- **Spec coverage:** triggers table + cancel column (T1), cron helper (T2), scheduler (T3), worker tick (T4), cancellation engine+runner (T5), trigger CRUD (T6), webhook (T7), cancel endpoint (T8), live verify (T9), UI (T10), docs+sweep (T11). All spec components mapped.
- **Type consistency:** `validateTriggerBody`/`ValidTrigger`, `enqueueDueCronTriggers(client, now)`, `nextRunAfter(expr, after, tz)`, `isValidCron(expr)`, `WorkflowCanceledError`, and the `EngineCallbacks.shouldCancel` signature are used identically across tasks. Run status vocab adds `canceled`; trigger `type` is `cron|webhook` everywhere.
- **Connected-only:** webhook uses the service client guarded on env; the worker/scheduler already only run in connected mode (Phase 1 instrumentation guard). Browser engine path unaffected (cancel hook absent → no check).
- **Snapshot model:** triggers carry `definition`; firing copies it into the run (matches Phase 1).
