-- User-added custom remote MCP connectors (lucy schema). Apply as supabase_admin.
-- Backs lib/mcp/custom.ts ("Add custom" connector by URL). No RLS policy —
-- access is server-side via the service role, scoped to user_id in app logic.
-- Mirrors production; already live on the cloud DB (this file is for clean rebuilds / dev).

create table if not exists lucy.custom_connectors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  slug text not null,
  name text not null,
  url text not null,
  token_enc text,
  created_at timestamptz not null default now(),
  unique (user_id, slug)
);
alter table lucy.custom_connectors enable row level security;
grant all on table lucy.custom_connectors to anon, authenticated, service_role;

notify pgrst, 'reload schema';
