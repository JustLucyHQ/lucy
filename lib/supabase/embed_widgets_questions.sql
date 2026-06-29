-- Embed widget starter questions (lucy.embed_widgets). Apply as supabase_admin.
-- `show_questions` toggles whether the tappable starter questions render in the
-- widget; `suggested_questions` is the list (the builder caps it to 6).
alter table lucy.embed_widgets add column if not exists show_questions boolean not null default true;
alter table lucy.embed_widgets add column if not exists suggested_questions text[] not null default '{}';
notify pgrst, 'reload schema';
