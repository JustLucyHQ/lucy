-- lib/supabase/auth_security.sql  — apply after schema.sql, as supabase_admin
set search_path to lucy, public;

create table if not exists lucy.email_verification_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  code_hash text not null,            -- scrypt 'salt:dk'
  purpose text not null,              -- 'reset' | '2fa'
  attempts int not null default 0,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists evc_user_purpose_idx on lucy.email_verification_codes(user_id, purpose);
alter table lucy.email_verification_codes enable row level security;
-- service-role only: no policies => clients cannot read/write; route handlers use the service client.

create table if not exists lucy.member_devices (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_name text,
  device_type text,
  browser text,
  os text,
  ip_address text,
  fingerprint text not null,
  is_current boolean not null default false,
  last_active_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, fingerprint)
);
alter table lucy.member_devices enable row level security;
create policy member_devices_select_own on lucy.member_devices for select using (auth.uid() = user_id);
create policy member_devices_delete_own on lucy.member_devices for delete using (auth.uid() = user_id);
-- inserts/updates happen via the service client in the track route.

create table if not exists lucy.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  company text,
  avatar_url text,
  two_factor_email_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table lucy.user_profiles enable row level security;
create policy user_profiles_select_own on lucy.user_profiles for select using (auth.uid() = user_id);
create policy user_profiles_insert_own on lucy.user_profiles for insert with check (auth.uid() = user_id);
create policy user_profiles_update_own on lucy.user_profiles for update using (auth.uid() = user_id);

-- one-time company migration from user_preferences (best-effort; ignore if column/table differ)
insert into lucy.user_profiles (user_id, company)
select user_id, company_name from lucy.user_preferences
where company_name is not null and company_name <> ''
on conflict (user_id) do update set company = excluded.company
where lucy.user_profiles.company is null;

notify pgrst, 'reload schema';
