-- Workflow record-event triggers v2. Apply to cloud + dev Supabase as supabase_admin.
-- Adds the previous row value (old_record) to emitted events so record_event triggers
-- can filter on a *change* (e.g. "only when status changes to done"), not just any write.
set search_path to lucy, public;

alter table lucy.workflow_events add column if not exists old_record jsonb;

-- record    = the current row (new for INSERT/UPDATE, old for DELETE) — unchanged
-- old_record = the previous row (null on INSERT) — new, drives change conditions
create or replace function lucy.emit_workflow_event()
returns trigger language plpgsql security definer set search_path = lucy as $$
begin
  insert into lucy.workflow_events (table_name, op, record, old_record)
  values (tg_table_name, tg_op, to_jsonb(coalesce(new, old)), to_jsonb(old));
  return coalesce(new, old);
end;
$$;

notify pgrst, 'reload schema';
