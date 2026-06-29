-- Telegram channel — config + identity mapping. Apply as supabase_admin.
-- All tables are service-role only (the webhook uses the service client);
-- no anon/RLS policies are granted.

create table if not exists lucy.telegram_settings (
  id int primary key default 1,
  bot_token_encrypted text,
  mode text not null default 'shared' check (mode in ('shared', 'linked')),
  allowlist bigint[] not null default '{}',
  shared_owner_user_id uuid,
  shared_api_key_encrypted text,
  default_provider text not null default 'anthropic',
  default_model text not null default 'claude-sonnet-4-6',
  webhook_secret text,
  enabled boolean not null default false,
  updated_at timestamptz default now(),
  constraint telegram_settings_singleton check (id = 1)
);

-- linked mode: a Telegram user bound to a Lucy account (+ that user's API key)
create table if not exists lucy.telegram_links (
  telegram_user_id bigint primary key,
  lucy_user_id uuid not null,
  api_key_encrypted text not null,
  linked_at timestamptz default now()
);

-- short-lived codes generated in the web app for the /link handshake
create table if not exists lucy.telegram_link_codes (
  code text primary key,
  lucy_user_id uuid not null,
  expires_at timestamptz not null,
  used boolean not null default false,
  created_at timestamptz default now()
);

alter table lucy.telegram_settings  enable row level security;
alter table lucy.telegram_links      enable row level security;
alter table lucy.telegram_link_codes enable row level security;
