-- lib/supabase/user_profiles_lockdown.sql (security, 2026-10-04)
-- Browsers (anon key + the person's JWT) could write ANY column of their own lucy.user_profiles row through
-- PostgREST — including email_verified (skip the sign-up e-mail check) and two_factor_email_enabled (switch
-- e-mail 2FA off with only a password). Those two are now server-only (service role: sign-up/confirm routes,
-- /api/auth/2fa/email). The browser keeps writing just the profile fields it edits.
-- Apply as supabase_admin. Idempotent.
revoke insert, update on lucy.user_profiles from anon, authenticated;
grant insert (user_id, display_name, avatar_url, company, updated_at) on lucy.user_profiles to authenticated;
-- user_id is included because PostgREST's upsert sets every sent column; the RLS policy still pins it to auth.uid().
grant update (user_id, display_name, avatar_url, company, updated_at) on lucy.user_profiles to authenticated;

notify pgrst, 'reload schema';
