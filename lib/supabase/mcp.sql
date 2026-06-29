-- lib/supabase/mcp.sql — apply as supabase_admin after schema.sql
set search_path to lucy, public;

create table if not exists lucy.mcp_servers (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text,
  author text,
  category text not null,                 -- dev|productivity|messaging|data|payments|search|local|builtin
  icon text,
  transport text not null,                -- stdio|http|sse
  install_ref text,                       -- npm pkg (stdio) or base URL (http/sse)
  config_schema jsonb not null default '[]'::jsonb,   -- [{key,label,type,required,help}]
  tools jsonb not null default '[]'::jsonb,           -- [{name,description}]
  meta jsonb not null default '{}'::jsonb,            -- {authMethod, oauth, docsUrl, getKeyUrl, steps}
  verified boolean not null default false,
  built_in boolean not null default false,
  install_count int not null default 0,
  rating numeric,
  created_at timestamptz not null default now()
);
-- Backfill for DBs created before `meta` existed (idempotent) — without it
-- seedCatalog's upsert silently fails and the catalog stays partially seeded.
alter table lucy.mcp_servers add column if not exists meta jsonb not null default '{}'::jsonb;
alter table lucy.mcp_servers enable row level security;
create policy mcp_servers_read on lucy.mcp_servers for select using (true);  -- public catalog
-- writes are service-role only (no insert/update policy)

create table if not exists lucy.mcp_installations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  server_slug text not null,
  config jsonb not null default '{}'::jsonb,   -- secret values stored encrypted
  enabled boolean not null default true,
  require_approval boolean not null default false,
  installed_at timestamptz not null default now(),
  unique (user_id, server_slug)
);
alter table lucy.mcp_installations enable row level security;
create policy mcp_inst_select_own on lucy.mcp_installations for select using (auth.uid() = user_id);
create policy mcp_inst_insert_own on lucy.mcp_installations for insert with check (auth.uid() = user_id);
create policy mcp_inst_update_own on lucy.mcp_installations for update using (auth.uid() = user_id);
create policy mcp_inst_delete_own on lucy.mcp_installations for delete using (auth.uid() = user_id);

notify pgrst, 'reload schema';
