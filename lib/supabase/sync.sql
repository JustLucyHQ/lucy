-- Local → Cloud sync support.
--
-- Apply to the CLOUD Supabase (justlucy.ai) as supabase_admin. Adds a stable
-- client_id (the desktop app's local conversation/message id) so a re-run of the
-- push upserts in place instead of duplicating.
--
-- Plain (non-partial) unique indexes are used deliberately: Postgres treats NULL
-- as distinct in unique indexes, so pre-existing rows (client_id NULL) never
-- collide with each other, and PostgREST can use these as on_conflict targets.

alter table lucy.conversations add column if not exists client_id text;
alter table lucy.messages      add column if not exists client_id text;

create unique index if not exists conversations_user_client_uniq
  on lucy.conversations (user_id, client_id);

create unique index if not exists messages_conv_client_uniq
  on lucy.messages (conversation_id, client_id);
