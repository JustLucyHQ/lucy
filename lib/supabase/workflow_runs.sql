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

-- workflow_id was uuid + FK to lucy.workflows, but workflows can live in
-- localStorage (string ids like "wf_ex_github-repo"). Make it free-text so runs
-- from any workflow record + list (otherwise the per-workflow history query 500s
-- with "invalid input syntax for uuid").
alter table lucy.workflow_runs drop constraint if exists workflow_runs_workflow_id_fkey;
alter table lucy.workflow_runs alter column workflow_id type text using workflow_id::text;

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
