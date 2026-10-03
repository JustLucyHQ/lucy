-- lib/supabase/anon_write_lockdown.sql (security, 2026-10-04) — Sys/security-rls-audit-2026-10-04.md
-- Signed-out visitors (the public anon key) never write to Lucy's tables: sign-up, codes, embed chat and forms
-- all go through server routes with the service role. RLS already refused these writes; this removes the
-- grants as well, so a future table with a loose policy can't be written by anyone holding the anon key.
-- Apply as supabase_admin. Idempotent.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c WHERE c.relnamespace = 'lucy'::regnamespace AND c.relkind IN ('r','p') LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON lucy.%I FROM anon', t.relname);
    EXECUTE format('REVOKE TRUNCATE ON lucy.%I FROM authenticated', t.relname);
  END LOOP;
END $$;
ALTER DEFAULT PRIVILEGES IN SCHEMA lucy REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLES FROM anon;

notify pgrst, 'reload schema';
