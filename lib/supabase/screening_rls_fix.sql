-- Fix screening multi-tenancy: add created_by so each user only sees their own screenings.
-- Service-role (used by API routes) bypasses RLS, so the API still works for inter-app calls.

set search_path to lucy, public;

-- Add created_by column to track which Lucy user initiated the screening
alter table screenings add column if not exists created_by uuid references auth.users(id);

-- Drop the old wide policies
drop policy if exists "Authenticated can read screenings" on screenings;
drop policy if exists "Authenticated can insert screenings" on screenings;
drop policy if exists "Authenticated can update screenings" on screenings;
drop policy if exists "Authenticated can read screening answers" on screening_answers;
drop policy if exists "Authenticated can insert screening answers" on screening_answers;

-- Tight policies: users only see/manage their own screenings
create policy "Users read own screenings" on screenings
  for select using (auth.uid() = created_by);

create policy "Users insert own screenings" on screenings
  for insert with check (auth.uid() = created_by);

create policy "Users update own screenings" on screenings
  for update using (auth.uid() = created_by);

-- Service role always bypasses RLS, so API routes (which use service_role) are unaffected.

-- Screening answers scoped through the screening's created_by
create policy "Users read own screening answers" on screening_answers
  for select using (
    screening_id in (select id from screenings where created_by = auth.uid())
  );

create policy "Users insert own screening answers" on screening_answers
  for insert with check (
    screening_id in (select id from screenings where created_by = auth.uid())
  );

-- Index for the new column
create index if not exists idx_screenings_created_by on screenings(created_by);
