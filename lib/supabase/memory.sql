-- lib/supabase/memory.sql
-- Lucy Memory System — Phase 1. Apply in the Supabase SQL editor.
-- Requires pgvector >= 0.7 for halfvec + hnsw. If those types/methods are
-- missing, run:  alter extension vector update;  (or swap halfvec->vector).
set search_path to lucy, public;

create extension if not exists vector;

-- ── Always-on profile ────────────────────────────────────────────────────────
create table if not exists memory_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid,
  org_id uuid,
  data jsonb not null default '{}',
  updated_at timestamptz default now()
);
-- one profile per (user, project); NULL project_id => the user-level profile
create unique index if not exists memory_profiles_user_project_uniq
  on memory_profiles (user_id, coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ── Collection ───────────────────────────────────────────────────────────────
create table if not exists memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid,
  org_id uuid,
  type text not null check (type in ('semantic','pragmatic','episodic')),
  category text,
  content text not null,
  summary text,
  importance int not null default 5,
  visibility text not null default 'private'
    check (visibility in ('private','project','global')),
  source text not null default 'extracted'
    check (source in ('extracted','user_remember','user_global','admin')),
  embedding halfvec(1536),
  fts tsvector generated always as (pg_catalog.to_tsvector('english', coalesce(content,''))) stored,
  source_conversation_id uuid references conversations(id) on delete set null,
  access_count int default 0,
  last_accessed timestamptz,
  valid_at timestamptz,
  invalid_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  expires_at timestamptz
);
create index if not exists memories_embedding_hnsw
  on memories using hnsw (embedding halfvec_cosine_ops);
create index if not exists memories_fts_gin on memories using gin (fts);
create index if not exists memories_scope on memories (user_id, project_id, visibility);

-- ── Entities (salience) ──────────────────────────────────────────────────────
create table if not exists entities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid,
  org_id uuid,
  name text not null,
  normalized_name text not null,
  type text,
  occurrence_count int default 1,
  importance int default 5,
  visibility text not null default 'private'
    check (visibility in ('private','project','global')),
  first_seen timestamptz default now(),
  last_seen timestamptz default now()
);
create unique index if not exists entities_user_project_name_uniq
  on entities (user_id, coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid), normalized_name);

-- ── Wiring (Phase 2 association substrate) ───────────────────────────────────
create table if not exists memory_entities (
  memory_id uuid references memories(id) on delete cascade,
  entity_id uuid references entities(id) on delete cascade,
  primary key (memory_id, entity_id)
);

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table memory_profiles enable row level security;
alter table memories enable row level security;
alter table entities enable row level security;
alter table memory_entities enable row level security;

create policy "own profile" on memory_profiles
  for all using (auth.uid() = user_id);

-- read: own rows or global; write: own rows only.
-- (project-membership widening arrives with the org tier in Phase C.)
create policy "read memories" on memories
  for select using (auth.uid() = user_id or visibility = 'global');
create policy "write own memories" on memories
  for all using (auth.uid() = user_id);

create policy "read entities" on entities
  for select using (auth.uid() = user_id or visibility = 'global');
create policy "write own entities" on entities
  for all using (auth.uid() = user_id);

create policy "own memory_entities" on memory_entities
  for all using (
    memory_id in (select id from memories where user_id = auth.uid())
    and entity_id in (select id from entities where user_id = auth.uid())
  );

-- ── Admin / deployment settings (single-row config) ──────────────────────────
create table if not exists memory_settings (
  id int primary key default 1 check (id = 1),
  enabled boolean not null default false,
  embedder_provider text not null default 'openai',
  embedder_model text not null default 'text-embedding-3-small',
  embedder_dimensions int not null default 1536,
  embedder_base_url text,  -- e.g. http://localhost:11434/v1 for Ollama; null => OpenAI
  embedder_api_key text,   -- key for cloud embedders (Cohere/Voyage/Google/…); SERVER-ONLY, never returned by the settings GET
  contradiction_policy text not null default 'supersede'
    check (contradiction_policy in ('supersede','keep_history')),
  deletion_grace_days int not null default 30,
  updated_at timestamptz default now()
);
insert into memory_settings (id) values (1) on conflict (id) do nothing;
alter table memory_settings enable row level security;
-- Service-role-only: embedder_api_key is a live secret and every legitimate
-- read already goes through a service-role client (see app/api/memory/settings/
-- route.ts) — a using(true) policy here was a critical unauthenticated-read hole.
create policy "service reads settings" on memory_settings
  for select using (auth.role() = 'service_role');
create policy "service writes settings" on memory_settings
  for all using (auth.role() = 'service_role');
revoke select on memory_settings from anon, authenticated;
