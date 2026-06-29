-- Workflow record-event triggers (Phase 2b). Apply to the cloud + dev Supabase
-- as supabase_admin. A row change on a watched lucy table emits a workflow_events
-- row; the in-process worker matches it against record_event triggers and enqueues
-- a run, then deletes the event (transient queue).

-- Allow the new record_event trigger type (Phase 2a created the check as cron|webhook).
alter table lucy.workflow_triggers drop constraint if exists workflow_triggers_type_check;
alter table lucy.workflow_triggers add constraint workflow_triggers_type_check
  check (type in ('cron','webhook','record_event'));

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
