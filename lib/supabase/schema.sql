-- Lucy AI — all tables live in the "lucy" schema
-- This mirrors how Contractors Room uses "contractors_room" schema.

create schema if not exists lucy;
set search_path to lucy, public;

-- Grant PostgREST access (must be in PGRST_DB_SCHEMAS)
grant usage on schema lucy to anon, authenticated, service_role;
grant all on all tables in schema lucy to anon, authenticated, service_role;
grant all on all sequences in schema lucy to anon, authenticated, service_role;
alter default privileges in schema lucy grant all on tables to anon, authenticated, service_role;
alter default privileges in schema lucy grant all on sequences to anon, authenticated, service_role;

-- ─── Chat tables ────────────────────────────────────────────────────────────

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  title text not null default 'New Chat',
  model text,
  provider text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  model text,
  provider text,
  tokens_used integer,
  created_at timestamptz default now()
);

create table if not exists provider_configs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  provider text not null,
  api_key_encrypted text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, provider)
);

create table if not exists user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme text default 'dark',
  default_model text default 'gpt-4o',
  default_provider text default 'openai',
  company_name text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ─── Workflow tables ────────────────────────────────────────────────────────

create table if not exists workflows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null default 'Untitled Workflow',
  description text,
  nodes jsonb not null default '[]',
  edges jsonb not null default '[]',
  is_published boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists workflow_runs (
  id uuid primary key default gen_random_uuid(),
  workflow_id text, -- workflows can live in localStorage (string ids), so not a FK
  user_id uuid references auth.users(id) on delete cascade,
  status text not null default 'pending',
  inputs jsonb,
  outputs jsonb,
  logs jsonb,
  started_at timestamptz default now(),
  completed_at timestamptz,
  error text
);

-- ─── Screening tables ──────────────────────────────────────────────────────

create table if not exists screenings (
  id uuid primary key default gen_random_uuid(),
  project_id        integer not null,
  contractor_company_id integer not null,
  client_company_id integer not null,
  screening_type text not null default 'project_screening'
    check (screening_type in ('profile_verification', 'project_screening')),
  contractor_profile jsonb,
  project_brief      text,
  custom_questions   text[],
  documents_provided text[],
  questions jsonb,
  grade       integer check (grade >= 1 and grade <= 5),
  grade_label text,
  summary     text,
  strengths   text[],
  concerns    text[],
  transcript  jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'generating_questions', 'awaiting_answers',
                      'grading', 'completed', 'failed')),
  error_message text,
  provider   text,
  model      text,
  tokens_used integer,
  created_by uuid references auth.users(id),
  workflow_run_id uuid references workflow_runs(id) on delete set null,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now(),
  completed_at timestamptz,
  unique(project_id, contractor_company_id, client_company_id, screening_type)
);

create table if not exists screening_answers (
  id uuid primary key default gen_random_uuid(),
  screening_id uuid not null references screenings(id) on delete cascade,
  question_id  text not null,
  question_text text not null,
  answer       text not null,
  answered_at  timestamptz default now()
);

-- ─── RLS ────────────────────────────────────────────────────────────────────

alter table conversations enable row level security;
alter table messages enable row level security;
alter table provider_configs enable row level security;
alter table user_preferences enable row level security;
alter table workflows enable row level security;
alter table workflow_runs enable row level security;
alter table screenings enable row level security;
alter table screening_answers enable row level security;

create policy "Users can manage own conversations" on conversations
  for all using (auth.uid() = user_id);
create policy "Users can manage own messages" on messages
  for all using (conversation_id in (select id from conversations where user_id = auth.uid()));
create policy "Users can manage own provider configs" on provider_configs
  for all using (auth.uid() = user_id);
create policy "Users can manage own preferences" on user_preferences
  for all using (auth.uid() = user_id);
create policy "Users can manage own workflows" on workflows
  for all using (auth.uid() = user_id);
create policy "Users can manage own workflow runs" on workflow_runs
  for all using (auth.uid() = user_id);

create policy "Users read own screenings" on screenings
  for select using (auth.uid() = created_by);
create policy "Users insert own screenings" on screenings
  for insert with check (auth.uid() = created_by);
create policy "Users update own screenings" on screenings
  for update using (auth.uid() = created_by);

create policy "Users read own screening answers" on screening_answers
  for select using (
    screening_id in (select id from screenings where created_by = auth.uid())
  );
create policy "Users insert own screening answers" on screening_answers
  for insert with check (
    screening_id in (select id from screenings where created_by = auth.uid())
  );

-- ─── Indexes ────────────────────────────────────────────────────────────────

create index if not exists idx_conversations_user on conversations(user_id, updated_at desc);
create index if not exists idx_messages_conversation on messages(conversation_id, created_at);
create index if not exists idx_workflows_user on workflows(user_id, updated_at desc);
create index if not exists idx_screenings_project on screenings(project_id);
create index if not exists idx_screenings_contractor on screenings(contractor_company_id);
create index if not exists idx_screenings_client on screenings(client_company_id);
create index if not exists idx_screenings_status on screenings(status);
create index if not exists idx_screenings_created_by on screenings(created_by);
create index if not exists idx_screening_answers_screening on screening_answers(screening_id);

-- ─── Triggers ───────────────────────────────────────────────────────────────

create or replace function lucy.update_screening_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_screenings_updated_at
  before update on screenings
  for each row execute function lucy.update_screening_timestamp();
