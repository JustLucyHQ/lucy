-- Embed widget conversation logging (lucy schema). Apply on the cloud DB as
-- supabase_admin. Lets widget owners read the chats visitors had with their
-- embedded assistant. Stateless /api/embed-chat writes here per turn.

create table if not exists lucy.embed_conversations (
  id text primary key,                         -- client-generated per visit
  widget_id text not null references lucy.embed_widgets(id) on delete cascade,
  user_id uuid not null,                        -- widget owner (denormalized for scoping)
  visitor_label text,
  message_count int not null default 0,
  created_at timestamptz not null default now(),
  last_at timestamptz not null default now()
);
create index if not exists embed_conversations_widget_idx on lucy.embed_conversations(widget_id, last_at desc);
create index if not exists embed_conversations_user_idx on lucy.embed_conversations(user_id, last_at desc);

create table if not exists lucy.embed_messages (
  id bigint generated always as identity primary key,
  conversation_id text not null references lucy.embed_conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists embed_messages_conv_idx on lucy.embed_messages(conversation_id, created_at);

alter table lucy.embed_conversations enable row level security;
alter table lucy.embed_messages enable row level security;

drop policy if exists embed_conv_owner_sel on lucy.embed_conversations;
create policy embed_conv_owner_sel on lucy.embed_conversations for select to authenticated using (user_id = auth.uid());
drop policy if exists embed_msg_owner_sel on lucy.embed_messages;
create policy embed_msg_owner_sel on lucy.embed_messages for select to authenticated
  using (exists (select 1 from lucy.embed_conversations c where c.id = conversation_id and c.user_id = auth.uid()));

grant select on lucy.embed_conversations to authenticated;
grant select on lucy.embed_messages to authenticated;
grant all on lucy.embed_conversations to service_role;
grant all on lucy.embed_messages to service_role;
grant usage, select on all sequences in schema lucy to service_role;
