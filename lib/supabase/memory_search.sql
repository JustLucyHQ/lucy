-- lib/supabase/memory_search.sql — apply after memory.sql
set search_path to lucy, public;

-- Vector search (cosine). Pass a halfvec literal; returns ids best-first.
create or replace function lucy.memory_vector_search(
  p_user uuid, p_query halfvec(1536), p_limit int
) returns table(id uuid, rank int) language sql stable as $$
  select m.id, row_number() over (order by m.embedding <=> p_query)::int
  from lucy.memories m
  where (m.user_id = p_user or m.visibility = 'global')
    and m.invalid_at is null and m.embedding is not null
  order by m.embedding <=> p_query
  limit p_limit;
$$;

-- Reshape the embedding column to a new dimension (admin-editable embedder model).
-- SECURITY DEFINER so the API service_role can run the DDL via an admin-gated
-- settings change. Existing embeddings are cleared (invalid at a new dimension)
-- and re-generated on next use. NOTE: function PARAM typmods aren't enforced by
-- Postgres, so the search functions accept any-dimension halfvec unchanged.
create or replace function lucy.set_embedding_dim(p_dim int)
returns void language plpgsql security definer
set search_path = lucy, public as $$
begin
  if p_dim < 1 or p_dim > 16000 then
    raise exception 'invalid embedding dimension %', p_dim;
  end if;
  drop index if exists lucy.memories_embedding_hnsw;
  update lucy.memories set embedding = null where embedding is not null;
  execute format('alter table lucy.memories alter column embedding type halfvec(%s)', p_dim);
  execute 'create index memories_embedding_hnsw on lucy.memories using hnsw (embedding halfvec_cosine_ops)';
end;
$$;
grant execute on function lucy.set_embedding_dim(int) to service_role;

-- Reinforcement: bump access_count + last_accessed atomically for retrieved memories.
-- SECURITY INVOKER (default) => RLS applies, so a user can only touch their own rows.
create or replace function lucy.memory_touch(p_ids uuid[])
returns void language sql as $$
  update lucy.memories
     set access_count = access_count + 1, last_accessed = now()
   where id = any(p_ids);
$$;

-- Keyword search (FTS). Returns ids best-first.
create or replace function lucy.memory_keyword_search(
  p_user uuid, p_query text, p_limit int
) returns table(id uuid, rank int) language sql stable as $$
  select m.id,
         row_number() over (order by pg_catalog.ts_rank(m.fts, pg_catalog.websearch_to_tsquery('english', p_query)) desc)::int
  from lucy.memories m
  where (m.user_id = p_user or m.visibility = 'global')
    and m.invalid_at is null
    and m.fts @@ pg_catalog.websearch_to_tsquery('english', p_query)
  order by pg_catalog.ts_rank(m.fts, pg_catalog.websearch_to_tsquery('english', p_query)) desc
  limit p_limit;
$$;
