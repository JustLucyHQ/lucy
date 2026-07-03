-- App-level signup email verification (lucy schema). Apply as supabase_admin.
-- Mirrors the existing reset/2FA code system (lib/email/codes.ts) with a new
-- 'signup' purpose, so Lucy no longer depends on GoTrue's own native
-- confirmation-link mailer (which is shared across every product on this
-- Supabase instance and can't be branded per-product). Existing/seeded
-- accounts are treated as already verified so they are never locked out.

-- 1. Add the column, defaulting false so the two backfills below are no-ops on
--    anything inserted by them, then flip the default for genuinely new signups.
alter table lucy.user_profiles
  add column if not exists email_verified boolean not null default false;

-- 2. Backfill existing user_profiles rows — a pre-existing account is verified.
update lucy.user_profiles set email_verified = true where email_verified = false;

-- 3. Backfill accounts that have NO user_profiles row at all (only created
--    lazily before this feature — signUp() now always creates one upfront).
--    Without this step a legacy user with no row would be indistinguishable
--    from a brand-new unconfirmed signup and get incorrectly locked out.
insert into lucy.user_profiles (user_id, email_verified)
select u.id, true from auth.users u
where not exists (select 1 from lucy.user_profiles p where p.user_id = u.id);

alter table lucy.user_profiles alter column email_verified set default false;

notify pgrst, 'reload schema';
