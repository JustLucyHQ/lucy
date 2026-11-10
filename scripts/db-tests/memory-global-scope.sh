#!/usr/bin/env bash
# scripts/db-tests/memory-global-scope.sh — proves on a REAL local database that user B cannot see user A's
# /global memory (security fix 2026-11-10).
#
# Local only: it runs psql inside the local Supabase DB container and RESETS the `lucy` schema there.
#   cd <a folder with `supabase init`> && supabase start      # Docker / Colima running
#   scripts/db-tests/memory-global-scope.sh                    # from the lucy-ee root
# Env: LUCY_DB_CONTAINER (default supabase_db_local-db). Exit 0 = PASS.
set -euo pipefail
cd "$(dirname "$0")/../.."
CONTAINER="${LUCY_DB_CONTAINER:-supabase_db_local-db}"
case "$CONTAINER" in supabase_db_*) ;; *) echo "refusing: $CONTAINER is not a local Supabase DB container" >&2; exit 2;; esac
psql() { docker exec -i "$CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q "$@"; }

echo "→ fresh lucy schema"
psql -c "drop schema if exists lucy cascade;" >/dev/null
for f in schema.sql memory.sql memory_search.sql memory_global_scope.sql; do
  psql < "lib/supabase/$f" >/dev/null
done

echo "→ two users, one global memory"
psql <<'SQL'
\set ON_ERROR_STOP on
begin;
insert into auth.users (id, email, aud, role) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'user-a@test.local', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-4000-8000-00000000000b', 'user-b@test.local', 'authenticated', 'authenticated');
insert into lucy.memories (user_id, type, content, importance, visibility, source) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'semantic', 'zebracode pricing of user A', 8, 'global', 'user_global');

-- 1) Search functions (the server calls them with the service role, so RLS does not help there).
do $$
declare b_hits int; a_hits int;
begin
  select count(*) into b_hits from lucy.memory_keyword_search('bbbbbbbb-0000-4000-8000-00000000000b', 'zebracode', 10) s
    join lucy.memories m on m.id = s.id where m.user_id = 'aaaaaaaa-0000-4000-8000-00000000000a';
  if b_hits <> 0 then raise exception 'FAIL: search gave user B % of user A''s memories', b_hits; end if;
  select count(*) into a_hits from lucy.memory_keyword_search('aaaaaaaa-0000-4000-8000-00000000000a', 'zebracode', 10);
  if a_hits <> 1 then raise exception 'FAIL: user A should find own memory (1), got %', a_hits; end if;
end $$;

-- 2) Read rules (RLS) for a signed-in user B reading the table directly from the browser.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-00000000000b","role":"authenticated"}', true); end $$;
do $$
declare n int;
begin
  select count(*) into n from lucy.memories where content like 'zebracode pricing%';
  if n <> 0 then raise exception 'FAIL: RLS shows user B user A''s memory'; end if;
end $$;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-00000000000a","role":"authenticated"}', true); end $$;
do $$
declare n int;
begin
  select count(*) into n from lucy.memories where content like 'zebracode pricing%';
  if n <> 1 then raise exception 'FAIL: RLS hides user A''s own memory from user A'; end if;
end $$;
rollback;
SQL
echo "PASS: user B cannot see user A's global memory"
