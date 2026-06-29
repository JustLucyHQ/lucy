# Durable Workflows — Phase 1 Design

**Date:** 2026-06-24
**Status:** Approved (design); spec under review
**Phase:** 1 of 2 — *Durable, server-side manual runs + run history.* Phase 2
(schedules + webhook triggers) is a separate spec.

## Problem

Lucy workflows run **entirely client-side** today: `WorkflowEngine.execute()`
runs in the browser, decrypted provider keys live in the tab, and a run dies if
the tab closes. Nothing is persisted — the `lucy.workflow_runs` table exists but
is never written. No workflow is "used for real": they only execute when a user
clicks **Run** in the builder.

## Goal (Phase 1)

A user clicks **Run** (connected mode) → the workflow executes **on the server**,
durably, with the run persisted and observable afterward. Specifically:

1. Server-side execution — keys decrypted server-side, long steps off the tab.
2. Runs persisted to `lucy.workflow_runs` with a full lifecycle + per-node logs.
3. Durability — the run survives closing the tab; a boot reaper fails orphans.
4. Observability — a **Runs** history view: status, per-node logs, timing, errors.
5. **"AI Agent" node** — relabel the `llm` node as **AI Agent**, with the user
   explicitly choosing the **provider + model** in its config (per review
   feedback: "calling LLM is not good, it should be AI agent — the user should
   choose which model"). Phase 1 scope is the relabel + model picker (it already
   calls the chosen provider/model); tool-using agentic behavior is a later node
   upgrade.

**Out of scope (Phase 2+):** cron schedules, webhook triggers, record-event
triggers, run cancellation, full DRAFT/PUBLISHED versioning, mid-graph
crash-resume, and the additional node types below. **Connected mode only** —
desktop/standalone (no Supabase) keeps the existing client-side engine.

## Triggers — Phase 1 vs Phase 2 (review feedback)

The reviewer likes Twenty's trigger menu (Record created/updated/deleted, Launch
manually, On a schedule, Webhook) and wants **scheduling**. Twenty models these
as `workflowAutomatedTrigger` rows with `type` ∈ {`DATABASE_EVENT`, `CRON`}
(+ webhook/manual). Mapping to our phases:

- **Phase 1 — "Launch manually" only.** The whole point of Phase 1's
  enqueue→worker design is that the *trigger surface* becomes trivial later: any
  trigger just inserts a `queued` run. So Phase 1 builds the durable foundation;
  manual Run is the one trigger.
- **Phase 2 (the priority next) — On a schedule + Webhook + Record events.** A
  `workflow_triggers` table (`type` cron/webhook/record-event + `settings jsonb`,
  mirroring Twenty); the same worker tick checks due cron rows and enqueues runs;
  `POST /api/workflows/[id]/webhook` enqueues from a request body; record-event
  triggers fire from Supabase changes. Run cancellation (`STOPPING/STOPPED`) lands
  here too.

This spec deliberately keeps scheduling in Phase 2 because it *requires* the
durable run model below to exist first — but Phase 1 is built so Phase 2 is
additive (no rework of the run/worker model).

## Node roadmap (post-Phase-1, not in this spec)

Twenty's node palette the reviewer liked, mapped to ours:

| Twenty node | Lucy today | Plan |
|---|---|---|
| If/else | `condition` | already have (relabel to "If / else") |
| AI Agent | `llm` | **relabel + model choice — Phase 1 (above)** |
| HTTP Request | `http` | already have |
| Send Email / Draft Email | — | new node (uses `lib/email`) — future |
| Filter, Iterator, Delay | — | new flow nodes — future |
| Code (Logic Function) | `transform` (partial) | extend / new sandboxed-code node — future |
| Form (Human Input) | — | new node (pauses run for input) — future, needs run-resume |
| Data CRUD / Search Record | `integration` (partial) | future |

These are additive node types; none change the Phase 1 execution/persistence model.

## Learnings folded in from Twenty CRM

Twenty's `workflowRun` uses an explicit `enqueuedAt → startedAt → endedAt`
lifecycle (an enqueue→worker queue), a `state` blob, `stepLogs`, and pins each
run to a `workflowVersionId`. We adopt the **enqueue→worker lifecycle**,
**per-step logs**, and **version pinning** — but pin via a lightweight
**definition snapshot on the run** instead of building a version table, and use
**Postgres-as-queue + an in-process worker** instead of BullMQ (no new infra).

## Architecture

```
Builder "Run" (connected)
   │  POST /api/workflows/run  { workflowId?, definition, inputs }
   ▼
workflow_runs row: status='queued', definition=snapshot, enqueued_at=now()
   ▲                                   │
   │ poll GET /api/workflows/runs/[id] │  in-process worker (instrumentation.ts)
   │ (status, logs, output)            ▼
   └──────────────── claim (SKIP LOCKED) → run server engine → persist logs/status
```

The worker is a single in-process poll loop started once per server process via
`instrumentation.ts`, **only when Supabase env is present** (so the desktop
standalone server never starts it).

## Components

### 1. Migration — `lib/supabase/workflow_runs.sql` (apply as `supabase_admin`)

The `lucy.workflow_runs` table already exists (`id, workflow_id, user_id,
status, inputs, outputs, logs, started_at, completed_at, error`). Extend it:

```sql
alter table lucy.workflow_runs add column if not exists definition jsonb;       -- snapshot of {name,nodes,edges}
alter table lucy.workflow_runs add column if not exists enqueued_at timestamptz default now();
alter table lucy.workflow_runs add column if not exists trigger text not null default 'manual';
alter table lucy.workflow_runs add column if not exists attempt int not null default 0;
-- started_at must be set when CLAIMED, not at insert:
alter table lucy.workflow_runs alter column started_at drop default;
-- Status lifecycle: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled'
alter table lucy.workflow_runs alter column status set default 'queued';

create index if not exists idx_workflow_runs_claim on lucy.workflow_runs (status, enqueued_at);
create index if not exists idx_workflow_runs_user on lucy.workflow_runs (user_id, enqueued_at desc);

-- Atomic claim: one queued run, SKIP LOCKED (safe across >1 worker/instance).
create or replace function lucy.claim_workflow_run()
returns lucy.workflow_runs
language plpgsql
as $$
declare
  claimed lucy.workflow_runs;
begin
  select * into claimed from lucy.workflow_runs
    where status = 'queued'
    order by enqueued_at
    for update skip locked
    limit 1;
  if not found then return null; end if;
  update lucy.workflow_runs
    set status = 'running', started_at = now(), attempt = attempt + 1
    where id = claimed.id
    returning * into claimed;
  return claimed;
end;
$$;
```

The worker calls this via `client.rpc('claim_workflow_run')` (service client,
schema `lucy`). RLS stays on the table; the worker + API use the service client
(scoped to `user_id` in app logic), matching the existing `provider-keys` route.

### 2. Server-safe engine — `lib/workflow/engine.ts` (modify)

The engine is portable except two browser couplings. Add an optional injected
`EngineDeps`, defaulting to today's browser behavior so the client path is
unchanged:

```ts
export interface EngineDeps {
  // KB search. Browser default: fetch('/api/memory/search'). Server: inject a
  // direct SupabaseMemoryStore.search call (no relative URL on the server).
  searchKnowledgeBase?: (query: string, topK: number) => Promise<string>;
  // Integration actions. Browser default: getSupabaseClient(). Server: inject the
  // service client.
  supabaseClient?: SupabaseClient | null;
}
```

- `runKnowledgeBase`: if `deps.searchKnowledgeBase` is set, call it; else the
  current `fetch('/api/memory/search')`.
- `runIntegration`: use `deps.supabaseClient` if provided; else the current
  `getSupabaseClient()`.

No behavior change for existing browser runs (deps undefined → current paths).

### 3. Server runner — `lib/workflow/server-runner.ts` (new)

`executeRun(run, serviceClient): Promise<void>` —
1. Read `run.definition` (snapshot) + `run.inputs` + `run.user_id`.
2. Resolve keys: `select provider, api_key_encrypted from provider_configs where
   user_id = run.user_id and is_active` → `decryptProviderKey` each →
   `apiKeys: Record<provider,string>`.
3. Build `EngineDeps`: `searchKnowledgeBase(query, topK)` constructs
   `new SupabaseMemoryStore(serviceClient, { apiKey: '' })`, calls
   `store.search({ userId: run.user_id, projectId: null }, query, { limit: topK })`,
   and formats the returned `MemoryRecord[]` into the same numbered-list string
   the engine's current `runKnowledgeBase` produces (so output is identical to the
   browser path); `supabaseClient = serviceClient`.
4. `new WorkflowEngine(definition, callbacks, deps)`; `callbacks.onLog` pushes to
   a logs array and **throttled-persists** `logs` to the run row (≤ every ~1s, plus a final flush) for live observability.
5. `await engine.execute(inputs, apiKeys)` → on resolve, persist
   `status='succeeded'`, `outputs={finalOutput}`, `logs`, `completed_at=now()`;
   on the engine returning `status:'error'` or a throw, persist
   `status='failed'`, `error`, `logs`, `completed_at`.

### 4. Worker — `lib/workflow/worker.ts` (new) + `instrumentation.ts` (new)

`instrumentation.ts`:
```ts
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return; // connected only
  const { startWorkflowWorker } = await import('./lib/workflow/worker');
  startWorkflowWorker();
}
```

`worker.ts`:
- `startWorkflowWorker()` — guarded by a `globalThis.__lucyWorkflowWorker` flag so
  dev hot-reload / double-register starts only one loop.
- Build a service client (`createClient(url, serviceKey, { db:{schema:'lucy'} })`).
- **Boot reaper (once):** `update workflow_runs set status='failed',
  error='interrupted (server restart)', completed_at=now() where status='running'`.
  (Single-instance assumption for Phase 1; SKIP LOCKED already protects the
  claim path if that assumption changes later.)
- **Poll loop:** every ~3 s, `rpc('claim_workflow_run')`; if a row returns, run
  `executeRun(row, client)` then immediately try to claim again (drain), else
  sleep. One run at a time (sequential) for Phase 1. Each run wrapped in
  try/catch so a thrown error marks the run failed and never kills the loop.

### 5. Trigger API — `app/api/workflows/run/route.ts` (new)

`POST` body `{ workflowId?: string, definition: { name, nodes, edges }, inputs: Record<string,string> }`:
- `resolveMemoryAuth(req)` → `userId` (cookie or `lucy_k_` key); 401 if none.
- Validate `definition.nodes` is a non-empty array and includes a `start` node;
  cap sizes defensively.
- Insert `workflow_runs { user_id, workflow_id: (workflowId if it's a UUID, else
  null), name: definition.name, definition, inputs, status:'queued',
  enqueued_at: now(), trigger:'manual' }` → return `{ runId }`.
- (`workflow_id` is null for localStorage `wf_` workflows — the run is
  self-contained via its `definition` snapshot.)

### 6. Run status / history API

- `GET /api/workflows/runs/[runId]` — `resolveMemoryAuth` → fetch the run scoped
  to `userId`; return `{ status, logs, outputs, error, enqueuedAt, startedAt,
  completedAt }`. The builder polls this (~1 s) while a run is active.
- `GET /api/workflows/runs?workflowId=<id>&limit=20` — recent runs for the
  history list (id, status, name, enqueuedAt, completedAt, duration).

### 7. UI — `components/workflow/RunPanel.tsx` (modify) + run history

- **Connected mode** (`isSupabaseEnabled()`): "Run" POSTs to
  `/api/workflows/run` with the current canvas `{definition, inputs}` → gets
  `runId` → polls `/api/workflows/runs/[runId]`, rendering live per-node logs
  (reuse the existing `ExecutionLogEntry` display) and final status.
- **Standalone/desktop** (no Supabase): unchanged — the existing client-side
  engine runs in the browser (no server to be durable against).
- **Run history**: a small "Runs" list in the builder (or a tab) calling
  `GET /api/workflows/runs?workflowId=…` — status badge, time, duration; clicking
  a run shows its persisted logs. This is the observability deliverable.

### 8. "AI Agent" node relabel — `lib/workflow/registry.ts`, `components/workflow/nodes/LLMNode.tsx`, `NodePanel.tsx`, `NodeConfigPanel.tsx` (modify)

Keep the internal node type `llm` (avoids churn in templates/engine), but present
it as **"AI Agent"**: update the palette label + icon (`NodePanel`/registry), the
node's on-canvas label/icon (`LLMNode`), and make the config panel's
**provider + model** selection prominent (reuse the chat `ModelSelector` shape so
the user picks any configured model). `LLMNodeConfig` already carries
`provider` + `model`, so this is presentation + a model picker, not a data
change. `NODE_CONFIG_DEFAULTS.llm.label` becomes `'AI Agent'`.

## Data flow (manual run, connected)

1. User clicks Run → client POSTs `{definition, inputs}` → run row `queued`.
2. Worker claims it (`running`, `started_at`), decrypts the user's keys, runs the
   engine, throttle-persists logs.
3. Engine finishes → run `succeeded`/`failed`, `outputs`/`error`, `completed_at`.
4. Builder's poll reflects each transition; the run stays in history.

## Error handling

- Per-node errors: the engine already catches them, logs the entry, and returns
  `status:'error'` → run `failed`, error surfaced in history.
- Missing provider key: engine throws `No API key configured for provider X` →
  run `failed` with that message (actionable).
- Worker crash / server restart mid-run: boot reaper marks stale `running` rows
  `failed('interrupted')`. (Auto-retry is Phase 2+.)
- Double execution: prevented by `claim_workflow_run()` (`FOR UPDATE SKIP LOCKED`).

## Testing

- **Unit** — `server-runner` with an injected fake engine-deps + a stub client:
  asserts a successful run persists `succeeded`+outputs and a throwing node
  persists `failed`+error.
- **Engine** — a test that injecting `EngineDeps.searchKnowledgeBase` is used by
  `runKnowledgeBase` (and the browser default still fetches when absent).
- **Integration (dev Supabase)** — apply the migration to the dev DB; POST a tiny
  2-node workflow (start → llm or start → transform) to `/api/workflows/run` with
  a `lucy_k_` admin key; with the worker running in `next dev`, poll the run to
  `succeeded` and confirm `logs`/`outputs` persisted. Mirrors how local↔cloud
  sync was verified.
- **tsc + lint + build** clean; desktop standalone build still starts (worker
  guard skips when Supabase env is absent).

## Files

| File | Change |
|---|---|
| `lib/supabase/workflow_runs.sql` | new — columns + index + `claim_workflow_run()` RPC |
| `lib/workflow/engine.ts` | modify — optional injected `EngineDeps` (browser-preserving) |
| `lib/workflow/server-runner.ts` | new — `executeRun()` (keys, deps, persist) |
| `lib/workflow/worker.ts` | new — poll loop, atomic claim, boot reaper |
| `instrumentation.ts` | new — start worker in connected mode only |
| `app/api/workflows/run/route.ts` | new — enqueue a manual run |
| `app/api/workflows/runs/[runId]/route.ts` | new — run status (poll) |
| `app/api/workflows/runs/route.ts` | new — run history list |
| `components/workflow/RunPanel.tsx` | modify — server run + poll in connected mode |
| `components/workflow/RunsHistory.tsx` | new — run history list/detail |
| `lib/workflow/registry.ts`, `components/workflow/nodes/LLMNode.tsx`, `components/workflow/NodePanel.tsx`, `components/workflow/NodeConfigPanel.tsx`, `lib/workflow/types.ts` | modify — relabel `llm` node as "AI Agent" + prominent model picker |
| `docs/DEPLOYMENT.md` | add `workflow_runs.sql` to the migration list + a Workflows note |

## Phase 2 (next spec, for reference)

`workflow_triggers` table (`type` cron/webhook + `settings jsonb`); the worker's
tick also enqueues due cron schedules; `POST /api/workflows/[id]/webhook` enqueues
from a request body; optional DRAFT/PUBLISHED versioning; auto-retry with backoff.
