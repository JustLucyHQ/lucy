# Durable Workflows — Phase 2a Design (Triggers: schedule + webhook + cancel)

**Date:** 2026-06-24
**Status:** Approved (design); spec under review
**Builds on:** Phase 1 (`2026-06-24-durable-workflows-phase1-design.md`, shipped).
**Phase 2b (separate spec, later):** record-event triggers.

## Problem

After Phase 1, a workflow only runs when a user clicks **Run**. Phase 2a adds
**triggers** so a workflow runs on its own — on a schedule, from a webhook — plus
the ability to **cancel** a run. Record-event triggers (fire on a DB row change)
are harder on self-hosted Supabase and are deferred to Phase 2b.

## The key lever (from Phase 1)

Enqueuing a run is just **inserting a `lucy.workflow_runs` row** (`status:'queued'`
+ a `definition` snapshot + `inputs`). The Phase 1 worker's 3s tick already drains
the queue. So every trigger only has to produce that insert — no new execution
path. Phase 2a adds (a) a triggers table, (b) a cron pass in the existing tick,
(c) a webhook endpoint, (d) a cancel path.

## Trigger model

Triggers are rows in **`lucy.workflow_triggers`** (mirrors Twenty's
`workflowAutomatedTrigger`). **Decision: each trigger stores a snapshot of the
workflow definition** (`{name, nodes, edges}`), exactly like a run does — rather
than referencing a server-persisted workflow. Rationale: today workflows live in
browser localStorage (the `workflows` table is empty), so a snapshot makes
triggers self-contained and consistent with Phase 1; re-saving the trigger from
the builder refreshes the snapshot. `workflow_id` is stored when available (a real
UUID) purely for grouping/links.

## Components

### 1. Migration — `lib/supabase/workflow_triggers.sql` (apply as `supabase_admin`)

```sql
create table if not exists lucy.workflow_triggers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  workflow_id uuid,                          -- optional link (null for localStorage workflows)
  name text not null default 'Trigger',
  type text not null check (type in ('cron','webhook')),
  settings jsonb not null default '{}'::jsonb,  -- cron: {expr, timezone?}; webhook: {}
  definition jsonb not null,                 -- snapshot {name, nodes, edges}
  inputs jsonb not null default '{}'::jsonb,  -- default inputs (cron); webhook merges body over these
  enabled boolean not null default true,
  secret text,                               -- webhook token (random, url-safe)
  next_run_at timestamptz,                    -- cron: next due time
  last_enqueued_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_workflow_triggers_user on lucy.workflow_triggers (user_id);
create index if not exists idx_workflow_triggers_cron on lucy.workflow_triggers (type, enabled, next_run_at);
alter table lucy.workflow_triggers enable row level security;
create policy "own triggers" on lucy.workflow_triggers
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Run cancellation
alter table lucy.workflow_runs add column if not exists cancel_requested boolean not null default false;
-- status vocab gains 'canceled' (text column — no enum change).
```

The worker + API routes use the service client (bypass RLS, scope by `user_id` in
app code), matching the Phase 1 / provider-keys convention.

### 2. Cron parsing — `cron-parser` dep + `lib/workflow/cron.ts`

A thin wrapper over `cron-parser` (a tiny, dependency-free npm lib — no infra):

```ts
export function isValidCron(expr: string): boolean
export function nextRunAfter(expr: string, after: Date, timezone?: string): Date | null
```

### 3. Cron scheduler in the worker tick — `lib/workflow/scheduler.ts` + `worker.ts` (modify)

New `enqueueDueCronTriggers(client)`:
- `select * from workflow_triggers where type='cron' and enabled and (next_run_at is null or next_run_at <= now())`.
- For each: insert a `workflow_runs` row (`status:'queued'`, `definition` = trigger
  snapshot, `inputs` = trigger.inputs, `trigger:'cron'`, `workflow_id`, `name`).
  Compute `next_run_at = nextRunAfter(expr, now)`; update the trigger
  (`next_run_at`, `last_enqueued_at`). A missed window (server was down) fires
  **once** and advances to the next future slot — no backlog catch-up.

`worker.ts` tick: call `enqueueDueCronTriggers(client)` **before** draining the
queue, so a just-due cron runs in the same tick. Wrapped in try/catch so a bad
cron row never kills the loop.

### 4. Cancellation — `engine.ts` (small hook) + `server-runner.ts` (modify)

- Add an optional `EngineCallbacks.shouldCancel?: () => boolean | Promise<boolean>`,
  checked at the top of `executeNode`; if it returns true the engine throws a
  sentinel `WorkflowCanceledError`. Browser path unaffected (callback absent).
- `server-runner` provides `shouldCancel` that reads `workflow_runs.cancel_requested`
  for this run, **throttled** (≤ once every ~2s, cached between fast nodes). On
  `WorkflowCanceledError` it persists `status:'canceled'` (not `failed`) +
  `completed_at`.
- True mid-stream abort of a single long LLM call is out of scope for 2a — cancel
  takes effect at the next node boundary.

### 5. Trigger management API

- `app/api/workflows/triggers/route.ts` — `GET ?workflowId=` (list user's triggers)
  and `POST` (create). POST: `resolveMemoryAuth` → userId; body
  `{ workflowId?, name, type, settings, definition, inputs? }`. For `cron`:
  `isValidCron(settings.expr)` (400 if bad), `next_run_at = nextRunAfter(expr, now)`.
  For `webhook`: generate a url-safe `secret`. Insert; return the trigger (+ the
  webhook URL for webhook type).
- `app/api/workflows/triggers/[id]/route.ts` — `PATCH` (enable/disable, update
  settings/definition → re-snapshot + recompute `next_run_at` for cron) and
  `DELETE`. All scoped to `userId`.

### 6. Webhook endpoint — `app/api/workflows/triggers/[id]/webhook/route.ts`

`POST` (+ `OPTIONS`/CORS like `/api/sync/push`; public, secret-gated): load the
trigger via the service client; require `type='webhook'`, `enabled`, and the
`secret` matching `?token=` or an `x-webhook-token` header; rate-limit
(`checkRateLimit('wf-webhook', triggerId, …)`). Enqueue a run: `workflow_runs`
insert with `definition` = snapshot, `inputs` = `{ ...trigger.inputs, ...body }`,
`trigger:'webhook'`, `user_id` = trigger.user_id. Return `{ runId }`. Generic
errors (never echo the secret).

### 7. Cancel endpoint — `app/api/workflows/runs/[runId]/cancel/route.ts`

`POST`: `resolveMemoryAuth` → userId; load the run scoped to userId.
- `queued` → set `status:'canceled'`, `completed_at` (the claim RPC only takes
  `queued`, so it will never start).
- `running` → set `cancel_requested = true` (the worker flips it to `canceled` at
  the next node boundary).
- terminal → no-op. Return the resulting status.

### 8. UI

- **`components/workflow/TriggersPanel.tsx`** — in the builder: lists this
  workflow's triggers; "Add trigger" → choose **On a schedule** (cron presets:
  every hour / every day 09:00 / every Monday 09:00 / custom expression) or
  **Webhook** (shows the URL + secret to copy). Enable/disable toggle, delete.
  Creating/updating sends the builder's current `{name, nodes, edges}` as the
  `definition` snapshot. Mounts next to the Run / See-Runs controls.
- **`components/workflow/RunsHistory.tsx`** (modify) — a **Cancel** button on
  `queued`/`running` runs and a `canceled` status badge.

**Connected-mode only** (no Supabase on desktop), same guard as Phase 1.

## Data flow

- **Cron:** tick → `enqueueDueCronTriggers` inserts a `queued` run from the
  snapshot → same tick drains it → worker runs it → `succeeded`. Trigger's
  `next_run_at` advances.
- **Webhook:** external POST → secret check → `queued` run from snapshot+body →
  worker runs it.
- **Cancel:** queued → `canceled` immediately; running → flag → `canceled` at the
  next node.

## Error handling

- Invalid cron expr rejected at create/update (400); a bad stored cron row is
  caught per-trigger in the tick and skipped (logged), never killing the loop.
- Webhook bad/missing secret → 401; disabled trigger → 403; rate-limited → 429.
- Cancel of a terminal run → no-op 200.

## Testing

- **Unit:** `cron.ts` (`isValidCron`, `nextRunAfter` advances correctly);
  `scheduler.enqueueDueCronTriggers` with a fake client (a due trigger inserts a
  run + advances `next_run_at`; a not-due trigger does nothing).
- **Engine:** `shouldCancel` returning true throws `WorkflowCanceledError` and the
  browser path is unaffected when absent.
- **Integration (dev Supabase + worker):** (a) create a cron trigger with
  `next_run_at` in the past via the API → within one tick a run appears and
  reaches `succeeded`; (b) create a webhook trigger → POST its URL with the token
  → run enqueued + `succeeded`; (c) cancel a queued run → `canceled`.
- tsc + lint + build clean; desktop standalone still starts (no worker/triggers).

## Files

| File | Change |
|---|---|
| `lib/supabase/workflow_triggers.sql` | new — triggers table + run cancel columns |
| `lib/workflow/cron.ts` (+ test) | new — cron validate + next-run |
| `lib/workflow/scheduler.ts` (+ test) | new — `enqueueDueCronTriggers` |
| `lib/workflow/worker.ts` | modify — call scheduler each tick |
| `lib/workflow/engine.ts` | modify — `shouldCancel` hook + `WorkflowCanceledError` |
| `lib/workflow/server-runner.ts` | modify — provide throttled `shouldCancel`; persist `canceled` |
| `app/api/workflows/triggers/route.ts` | new — GET list / POST create |
| `app/api/workflows/triggers/[id]/route.ts` | new — PATCH / DELETE |
| `app/api/workflows/triggers/[id]/webhook/route.ts` | new — public secret-gated enqueue |
| `app/api/workflows/runs/[runId]/cancel/route.ts` | new — cancel |
| `components/workflow/TriggersPanel.tsx` | new — trigger CRUD UI |
| `components/workflow/RunsHistory.tsx` | modify — cancel button + canceled badge |
| `app/workflows/[id]/page.tsx` | modify — mount TriggersPanel |
| `package.json` | add `cron-parser` |
| `docs/DEPLOYMENT.md` | migration list + triggers note |

## Out of scope (Phase 2b / later)

Record-event triggers (Supabase realtime / DB-webhooks / polling — to be designed
separately), mid-stream LLM abort, DRAFT/PUBLISHED workflow versioning, retry/backoff.
