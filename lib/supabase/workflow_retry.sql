-- Workflow run retry/backoff + idempotency (Phase 3). Apply to the cloud + dev
-- Supabase as supabase_admin.

alter table lucy.workflow_runs add column if not exists max_attempts int not null default 1;
alter table lucy.workflow_runs add column if not exists next_attempt_at timestamptz;
alter table lucy.workflow_runs add column if not exists idempotency_key text;

-- Idempotency: a given key enqueues at most one run (dedupes re-processed events
-- and double-fired triggers). NULL keys are unconstrained.
create unique index if not exists idx_workflow_runs_idempotency
  on lucy.workflow_runs (idempotency_key) where idempotency_key is not null;

create index if not exists idx_workflow_runs_claim2
  on lucy.workflow_runs (status, next_attempt_at, enqueued_at);

-- Claim one due queued run. A run scheduled for a future retry (next_attempt_at
-- in the future) is skipped until its time. FOR UPDATE SKIP LOCKED keeps it safe
-- across workers.
-- Returns SETOF so an empty queue yields an empty result set. A scalar-composite
-- return renders as an all-NULL row through PostgREST (.rpc), which the worker would
-- otherwise treat as a real run with a null definition. DROP+CREATE because changing
-- the return type can't be done with CREATE OR REPLACE.
drop function if exists lucy.claim_workflow_run();
create function lucy.claim_workflow_run()
returns setof lucy.workflow_runs
language plpgsql
security definer
set search_path = lucy
as $$
declare
  claimed lucy.workflow_runs;
begin
  select * into claimed from lucy.workflow_runs
    where status = 'queued'
      and (next_attempt_at is null or next_attempt_at <= now())
    order by coalesce(next_attempt_at, enqueued_at)
    for update skip locked
    limit 1;
  if not found then
    return;
  end if;
  update lucy.workflow_runs
    set status = 'running', started_at = now(), attempt = attempt + 1
    where id = claimed.id
    returning * into claimed;
  return next claimed;
  return;
end;
$$;

grant execute on function lucy.claim_workflow_run() to service_role;
