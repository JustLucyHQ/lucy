-- Workflow versioning (Phase 3). Apply to the cloud + dev Supabase as
-- supabase_admin. The builder canvas is the DRAFT; Publish snapshots it as a
-- numbered, immutable version that can be listed and restored.

create table if not exists lucy.workflow_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  workflow_id text not null,        -- the builder workflow id (uuid or local wf_…)
  version int not null,
  name text,
  definition jsonb not null,        -- snapshot { name, nodes, edges }
  published_at timestamptz not null default now()
);

create unique index if not exists idx_workflow_versions_unique
  on lucy.workflow_versions (user_id, workflow_id, version);
create index if not exists idx_workflow_versions_list
  on lucy.workflow_versions (user_id, workflow_id, version desc);

alter table lucy.workflow_versions enable row level security;
drop policy if exists "own versions" on lucy.workflow_versions;
create policy "own versions" on lucy.workflow_versions
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
