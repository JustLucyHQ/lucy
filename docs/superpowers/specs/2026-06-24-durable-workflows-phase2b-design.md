# Durable Workflows — Phase 2b Design (Record-event triggers)

**Date:** 2026-06-24
**Status:** Approved (autonomous build authorized)
**Builds on:** Phase 1 (runs + worker) and Phase 2a (cron + webhook triggers + cancel), both shipped.

## Problem

Phase 2a lets workflows run on a schedule or from a webhook. Phase 2b adds the
third trigger type from Twenty's menu: **record events** — run a workflow when a
row is **created / updated / deleted** in a watched table.

## Mechanism (decision)

Of the three options weighed in the Phase 2a brainstorm — Supabase Realtime
`postgres_changes`, Supabase DB-webhooks (`pg_net`), or **Postgres trigger → queue
table → worker poll** — we use the **third**. It is the most self-contained on the
shared self-hosted Postgres (no `pg_net` extension, no realtime publication
config, no long-lived websocket), reuses Phase 1's "enqueue = insert a queued run"
path, and is trivially verifiable end-to-end (insert a row → a run appears).

```
INSERT/UPDATE/DELETE on a watched lucy table
   │  (AFTER-row trigger: lucy.emit_workflow_event)
   ▼
lucy.workflow_events  (table_name, op, record jsonb)   ← transient queue
   ▲
   │  worker tick: processRecordEvents()
   └── match enabled record_event triggers (table + op) → enqueue a queued run → delete the event
```

The same in-process worker tick that drains cron triggers also drains record
events. Connected-mode only (no Supabase on desktop), same as the rest.

## Watched tables

The shipped watched set is **`lucy.conversations`** and **`lucy.memories`** —
meaningful Lucy entities at low write volume. (`lucy.messages` is intentionally
excluded: highest write volume, per-message overhead not worth it.) Adding a table
later is a one-line `create trigger … execute function lucy.emit_workflow_event()`
plus an allowlist entry.

## Components

### 1. Migration — `lib/supabase/workflow_events.sql` (apply as `supabase_admin`)

```sql
create table if not exists lucy.workflow_events (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  op text not null,                 -- INSERT | UPDATE | DELETE
  record jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_workflow_events_created on lucy.workflow_events (created_at);
alter table lucy.workflow_events enable row level security;  -- service-role only; no policy

create or replace function lucy.emit_workflow_event()
returns trigger language plpgsql security definer set search_path = lucy as $$
begin
  insert into lucy.workflow_events (table_name, op, record)
  values (tg_table_name, tg_op, to_jsonb(coalesce(new, old)));
  return coalesce(new, old);
end;
$$;

drop trigger if exists emit_event_conversations on lucy.conversations;
create trigger emit_event_conversations after insert or update or delete on lucy.conversations
  for each row execute function lucy.emit_workflow_event();
drop trigger if exists emit_event_memories on lucy.memories;
create trigger emit_event_memories after insert or update or delete on lucy.memories
  for each row execute function lucy.emit_workflow_event();
```

(The exact `memories` table name is confirmed against the live schema during
implementation; if it differs, the trigger attaches to the real table and the
allowlist matches.)

### 2. Event processor — `lib/workflow/record-events.ts`

`processRecordEvents(client, limit = 100): Promise<number>`:
- Fetch the oldest `limit` `workflow_events`; return 0 if none.
- Load enabled `record_event` triggers once.
- For each event, enqueue a `queued` run for every trigger where
  `settings.table === event.table_name` and `settings.events` includes
  `event.op`. Run `inputs` = `{ ...trigger.inputs, event_table, event_op, record: JSON.stringify(event.record) }`; `trigger:'record_event'`.
- **Delete the whole fetched batch** (matched or not) — queue semantics keep the
  table near-empty even when no trigger matches.

### 3. Worker tick — `lib/workflow/worker.ts` (modify)

Call `processRecordEvents(client)` each tick, alongside `enqueueDueCronTriggers`,
inside the existing try/catch (before draining the run queue).

### 4. Validation — `app/api/workflows/triggers/validate.ts` (extend)

Accept `type: 'record_event'`. `settings.table` must be in the allowlist
(`conversations`, `memories`); `settings.events` must be a non-empty subset of
`['INSERT','UPDATE','DELETE']`. Definition still needs a Start node.

### 5. UI — `components/workflow/TriggersPanel.tsx` (extend)

Add a **Record event** add-option: a table dropdown (Conversations / Memories) +
event checkboxes (Created / Updated / Deleted) → creates a `record_event` trigger.
List rows show `record: <table> on <events>`.

### 6. Docs — `docs/DEPLOYMENT.md`

Add `workflow_events.sql` to the migration list and a record-event paragraph.

## Testing

- **Unit:** `processRecordEvents` with a fake client — an event matching an
  enabled trigger enqueues a run + deletes the batch; a non-matching event is
  deleted with no run; no events → 0.
- **Validation:** `validateTriggerBody` accepts a valid record_event trigger and
  rejects a bad table / empty events.
- **Integration (dev Supabase + worker):** create a `record_event` trigger
  (table=conversations, events=[INSERT]) via the API; `insert into lucy.conversations`
  a test row (admin `user_id`); within a tick a run is enqueued and reaches
  `succeeded`; clean up.
- tsc + lint + jest + build clean; desktop standalone unaffected (no worker).

## Files

| File | Change |
|---|---|
| `lib/supabase/workflow_events.sql` | new — events queue + emit trigger + attach to watched tables |
| `lib/workflow/record-events.ts` (+ test) | new — `processRecordEvents` |
| `lib/workflow/worker.ts` | modify — call it each tick |
| `app/api/workflows/triggers/validate.ts` (+ test) | modify — accept `record_event` |
| `components/workflow/TriggersPanel.tsx` | modify — Record-event add UI |
| `docs/DEPLOYMENT.md` | migration list + note |

## Out of scope

Per-field filters/conditions on events, watching arbitrary user-chosen tables
(dynamic DDL), Supabase Realtime delivery, and CTR-table events.
