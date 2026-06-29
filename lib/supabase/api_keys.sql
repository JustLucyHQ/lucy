-- Lucy API Keys — per-user key management for external integrations
-- Each key maps to a user_id so Lucy knows who owns the request.

set search_path to lucy, public;

create table if not exists api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- The full key is shown once on creation, then only the prefix is stored.
  -- key_hash is bcrypt or sha256 for validation.
  key_hash   text not null,
  key_prefix varchar(12) not null,    -- e.g. "lucy_k_abc1" for display

  name       varchar(100) not null default 'Default',
  is_active  boolean not null default true,

  created_at  timestamptz default now(),
  last_used_at timestamptz,

  unique(key_hash)
);

alter table api_keys enable row level security;

-- Users can only see/manage their own keys
create policy "Users manage own API keys" on api_keys
  for all using (auth.uid() = user_id);

-- Service role can read all (for key validation in API routes)
create policy "Service role can read all keys" on api_keys
  for select using (auth.role() = 'service_role');

create index if not exists idx_api_keys_user on api_keys(user_id);
create index if not exists idx_api_keys_hash on api_keys(key_hash);
create index if not exists idx_api_keys_prefix on api_keys(key_prefix);
