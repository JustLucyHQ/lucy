-- lib/supabase/memory_global_scope.sql — security fix 2026-11-10. Apply after memory.sql and memory_search.sql.
-- "Global" memory means a row with NO owner (user_id is null). Users never create those.
-- A user's /global note used to be stored as visibility 'global' with their user_id, and every other user of the
-- install could read it (RLS) and find it in search (memory_vector_search / memory_keyword_search). Now a row that
-- has an owner is readable by that owner only, whatever its visibility. Existing rows are NOT changed: the rules
-- below simply stop showing them to anyone else. Safe to re-run.
set search_path to lucy, public;

drop policy if exists "read memories" on lucy.memories;
create policy "read memories" on lucy.memories
  for select using (auth.uid() = user_id or (user_id is null and visibility = 'global'));

drop policy if exists "read entities" on lucy.entities;
create policy "read entities" on lucy.entities
  for select using (auth.uid() = user_id or (user_id is null and visibility = 'global'));

create or replace function lucy.memory_vector_search(
  p_user uuid, p_query halfvec(1536), p_limit int
) returns table(id uuid, rank int) language sql stable as $$
  select m.id, row_number() over (order by m.embedding <=> p_query)::int
  from lucy.memories m
  where (m.user_id = p_user or (m.user_id is null and m.visibility = 'global'))
    and m.invalid_at is null and m.embedding is not null
  order by m.embedding <=> p_query
  limit p_limit;
$$;

create or replace function lucy.memory_keyword_search(
  p_user uuid, p_query text, p_limit int
) returns table(id uuid, rank int) language sql stable as $$
  select m.id,
         row_number() over (order by pg_catalog.ts_rank(m.fts, pg_catalog.websearch_to_tsquery('english', p_query)) desc)::int
  from lucy.memories m
  where (m.user_id = p_user or (m.user_id is null and m.visibility = 'global'))
    and m.invalid_at is null
    and m.fts @@ pg_catalog.websearch_to_tsquery('english', p_query)
  order by pg_catalog.ts_rank(m.fts, pg_catalog.websearch_to_tsquery('english', p_query)) desc
  limit p_limit;
$$;

notify pgrst, 'reload schema';
