-- Embed chat-widget configs (lucy schema). Apply as supabase_admin.
-- Base table for the embeddable chat widgets (lib/embed/widgets.ts). Conversation
-- logging lives in embed_conversations.sql. No RLS policy — all access is
-- server-side via the service role (owner CRUD is gated in app/api/embed/widgets;
-- the public config endpoint returns only non-sensitive fields).
-- Mirrors production; already live on the cloud DB (this file is for clean rebuilds / dev).

create table if not exists lucy.embed_widgets (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'My assistant',
  persona text not null default '',
  faq text not null default '',
  model text not null default 'gpt-4o',
  provider text not null default 'openai',
  greeting text not null default 'Hi! How can I help?',
  launcher_label text not null default 'Chat with us',
  "position" text not null default 'bottom-right',
  theme text not null default 'dark',
  accent text not null default '#7c3aed',
  allowed_origins text[] not null default '{}',
  suggested_questions text[] not null default '{}',
  show_questions boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table lucy.embed_widgets enable row level security;
grant all on table lucy.embed_widgets to anon, authenticated, service_role;

notify pgrst, 'reload schema';
