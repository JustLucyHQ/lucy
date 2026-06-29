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
