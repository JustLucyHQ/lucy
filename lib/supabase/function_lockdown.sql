-- lib/supabase/function_lockdown.sql (security, 2026-10-05)
-- PostgreSQL lets everyone run a new function, and the lucy schema is exposed through PostgREST to the public anon key,
-- so two SECURITY DEFINER functions that only Lucy's own server calls were open to any visitor, signed out:
--   set_embedding_dim(n)  drops the memory index, sets EVERY stored embedding to null and alters the column type
--                         (a stranger could wipe all vector memories with one request);
--   claim_workflow_run()  takes the next queued workflow run and marks it running (steals runs and reads their input).
-- Both are called only with the service role (app/api/memory/settings/route.ts, lib/workflow/worker.ts), which keeps
-- EXECUTE; nobody else has it now. Apply as supabase_admin. Idempotent.
revoke all on function lucy.set_embedding_dim(integer) from public, anon, authenticated;
revoke all on function lucy.claim_workflow_run() from public, anon, authenticated;
grant execute on function lucy.set_embedding_dim(integer) to service_role;
grant execute on function lucy.claim_workflow_run() to service_role;

notify pgrst, 'reload schema';
