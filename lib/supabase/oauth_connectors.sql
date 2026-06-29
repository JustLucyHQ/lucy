-- OAuth Connect storage (lucy schema). Apply as supabase_admin.
-- Backs the one-click "Connect" connectors:
--   * oauth_connections — per-user encrypted access/refresh tokens (lib/oauth/connections.ts)
--   * oauth_clients     — cached Dynamic Client Registration (RFC 7591) clients (lib/oauth/dcr.ts)
-- Mirrors production; already live on the cloud DB (this file is for clean rebuilds / dev).

create table if not exists lucy.oauth_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  connector_slug text not null,
  access_token_enc text not null,
  refresh_token_enc text,
  expires_at timestamptz,
  scope text,
  account_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);
alter table lucy.oauth_connections enable row level security;
drop policy if exists oauth_conn_select_own on lucy.oauth_connections;
create policy oauth_conn_select_own on lucy.oauth_connections for select using (auth.uid() = user_id);
drop policy if exists oauth_conn_insert_own on lucy.oauth_connections;
create policy oauth_conn_insert_own on lucy.oauth_connections for insert with check (auth.uid() = user_id);
drop policy if exists oauth_conn_update_own on lucy.oauth_connections;
create policy oauth_conn_update_own on lucy.oauth_connections for update using (auth.uid() = user_id);
drop policy if exists oauth_conn_delete_own on lucy.oauth_connections;
create policy oauth_conn_delete_own on lucy.oauth_connections for delete using (auth.uid() = user_id);
grant all on table lucy.oauth_connections to anon, authenticated, service_role;

-- DCR client cache: one row per hosted remote-MCP authorization server. No RLS
-- policy (service-role only) — the app reads/writes it server-side during OAuth.
create table if not exists lucy.oauth_clients (
  provider text primary key,
  client_id text not null,
  client_secret_enc text,
  registration jsonb,
  created_at timestamptz not null default now()
);
alter table lucy.oauth_clients enable row level security;
grant all on table lucy.oauth_clients to anon, authenticated, service_role;

notify pgrst, 'reload schema';
