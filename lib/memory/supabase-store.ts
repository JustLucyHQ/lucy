import type { SupabaseClient } from '@supabase/supabase-js';
import type { MemoryStore } from './store';
import type {
  MemoryRecord, MemoryWrite, ReconcileWrite, EntityWrite, Profile, MemoryScope,
  SearchOptions, MemoryVisibility, UsageStats, ContradictionPolicy,
} from './types';
import { embedText, type EmbedderConfig } from './embeddings';
import { reciprocalRankFusionScored, rankScore } from './scoring';
import { mergeProfile, normalizeEntityName } from './profile';

function rowToRecord(r: Record<string, unknown>): MemoryRecord {
  return {
    id: r.id as string,
    userId: (r.user_id as string) ?? null,
    projectId: (r.project_id as string | null) ?? null,
    type: r.type as MemoryRecord['type'],
    category: (r.category as string) ?? undefined,
    content: r.content as string,
    summary: (r.summary as string) ?? undefined,
    importance: (r.importance as number) ?? 5,
    visibility: r.visibility as MemoryVisibility,
    source: r.source as MemoryRecord['source'],
    sourceConversationId: (r.source_conversation_id as string | null) ?? null,
    accessCount: (r.access_count as number) ?? 0,
    lastAccessed: r.last_accessed ? new Date(r.last_accessed as string).getTime() : null,
    validAt: r.valid_at ? new Date(r.valid_at as string).getTime() : null,
    invalidAt: r.invalid_at ? new Date(r.invalid_at as string).getTime() : null,
    createdAt: r.created_at ? new Date(r.created_at as string).getTime() : Date.now(),
    updatedAt: r.updated_at ? new Date(r.updated_at as string).getTime() : Date.now(),
    expiresAt: r.expires_at ? new Date(r.expires_at as string).getTime() : null,
  };
}

// Loose client type so the lucy-schema client (schema generic = 'lucy') is accepted.
type LucyClient = SupabaseClient<any, any, any>;

export class SupabaseMemoryStore implements MemoryStore {
  constructor(private client: LucyClient, private embedder: EmbedderConfig) {}

  async getProfile(scope: MemoryScope): Promise<Profile | null> {
    const { data } = await this.client
      .from('memory_profiles')
      .select('data, updated_at')
      .eq('user_id', scope.userId)
      .is('project_id', scope.projectId ?? null)
      .maybeSingle();
    if (!data) return null;
    return { data: (data.data as Record<string, unknown>) ?? {}, updatedAt: Date.now() };
  }

  async upsertProfile(scope: MemoryScope, patch: Record<string, unknown>): Promise<void> {
    const existing = await this.getProfile(scope);
    const merged = mergeProfile(existing?.data ?? {}, patch);
    const nowIso = new Date().toISOString();
    // Explicit update-or-insert: the unique index uses coalesce(project_id, sentinel),
    // which PostgREST's onConflict cannot target — upsert would create duplicate
    // user-level profiles (project_id NULL). Update-or-insert avoids that entirely.
    if (existing) {
      let q = this.client
        .from('memory_profiles')
        .update({ data: merged, updated_at: nowIso })
        .eq('user_id', scope.userId);
      q = scope.projectId == null ? q.is('project_id', null) : q.eq('project_id', scope.projectId);
      await q;
    } else {
      const { error } = await this.client.from('memory_profiles').insert({
        user_id: scope.userId,
        project_id: scope.projectId ?? null,
        data: merged,
        updated_at: nowIso,
      });
      if (error) {
        // A concurrent first-write created the row — fall back to update.
        let q = this.client
          .from('memory_profiles')
          .update({ data: merged, updated_at: nowIso })
          .eq('user_id', scope.userId);
        q = scope.projectId == null ? q.is('project_id', null) : q.eq('project_id', scope.projectId);
        await q;
      }
    }
  }

  private async embedOrNull(text: string): Promise<string | null> {
    const vec = await embedText(text, this.embedder);
    return vec ? `[${vec.join(',')}]` : null;
  }

  async store(scope: MemoryScope, memories: MemoryWrite[]): Promise<MemoryRecord[]> {
    if (memories.length === 0) return [];
    const payload = await Promise.all(
      memories.map(async (w) => ({
        user_id: scope.userId,
        project_id: scope.projectId ?? null,
        type: w.type,
        category: w.category ?? null,
        content: w.content,
        summary: w.summary ?? null,
        importance: w.importance ?? 5,
        visibility: w.visibility ?? 'private',
        source: w.source ?? 'extracted',
        source_conversation_id: w.sourceConversationId ?? null,
        valid_at: w.validAt ? new Date(w.validAt).toISOString() : null,
        embedding: await this.embedOrNull(w.content),
      }))
    );
    const { data, error } = await this.client.from('memories').insert(payload).select();
    if (error || !data) return [];
    return (data as Record<string, unknown>[]).map(rowToRecord);
  }

  async reconcile(
    scope: MemoryScope,
    items: ReconcileWrite[],
    policy: ContradictionPolicy
  ): Promise<void> {
    if (items.length === 0) return;
    // Each item is persisted immediately and in a data-safe order — there is no
    // end-of-batch flush that a mid-loop failure could skip, and keep_history
    // inserts the new row BEFORE invalidating the old (worst case on failure is a
    // harmless duplicate, never data loss).
    for (const it of items) {
      if (it.op === 'ADD' || !it.targetId) {
        await this.store(scope, [it]);
        continue;
      }
      // Confirm the target still exists (RLS also restricts this to the user's rows).
      const { data: target } = await this.client
        .from('memories')
        .select('id')
        .eq('id', it.targetId)
        .is('invalid_at', null)
        .maybeSingle();
      if (!target) {
        await this.store(scope, [it]);
        continue;
      }
      if (policy === 'keep_history') {
        await this.store(scope, [it]); // insert new version first (data-safe)
        await this.client
          .from('memories')
          .update({ invalid_at: new Date().toISOString() })
          .eq('id', it.targetId);
      } else {
        // supersede: overwrite in place (single atomic statement).
        await this.client
          .from('memories')
          .update({
            content: it.content,
            summary: it.summary ?? null,
            importance: it.importance ?? 5,
            updated_at: new Date().toISOString(),
            embedding: await this.embedOrNull(it.content),
          })
          .eq('id', it.targetId);
      }
    }
  }

  async search(scope: MemoryScope, query: string, opts: SearchOptions = {}): Promise<MemoryRecord[]> {
    const limit = opts.limit ?? 12;
    const vec = await embedText(query, this.embedder);

    const lists: string[][] = [];
    if (vec) {
      const { data } = await this.client.rpc('memory_vector_search', {
        p_user: scope.userId, p_query: `[${vec.join(',')}]`, p_limit: limit * 2,
      });
      if (data) lists.push((data as { id: string }[]).map((d) => d.id));
    }
    const { data: kw } = await this.client.rpc('memory_keyword_search', {
      p_user: scope.userId, p_query: query, p_limit: limit * 2,
    });
    if (kw && (kw as { id: string }[]).length) lists.push((kw as { id: string }[]).map((d) => d.id));

    // Preserve each id's RRF score so the type filter narrows the candidate set
    // WITHOUT destroying fusion merit (re-ranking by post-filter position would).
    const fused = reciprocalRankFusionScored(lists);
    const rrfScoreById = new Map(fused.map((f) => [f.id, f.score]));
    const fusedIds = fused.slice(0, limit * 2).map((f) => f.id);
    if (fusedIds.length === 0) return [];

    const { data: rows } = await this.client.from('memories').select('*').in('id', fusedIds);
    if (!rows) return [];
    const byId = new Map(
      (rows as Record<string, unknown>[]).map((r) => [r.id as string, rowToRecord(r)])
    );
    const now = Date.now();
    return fusedIds
      .map((id) => byId.get(id))
      .filter((m): m is MemoryRecord => Boolean(m) && (!opts.types || opts.types.includes(m!.type)))
      .map((m) => ({
        m,
        s: rankScore({
          base: rrfScoreById.get(m.id) ?? 0,
          importance: m.importance,
          ageDays: (now - m.createdAt) / 86_400_000,
          accessCount: m.accessCount,
        }),
      }))
      .sort((a, b) => b.s - a.s)
      .slice(0, limit)
      .map((x) => x.m);
  }

  async touch(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    // Atomic batch increment of access_count + last_accessed (reinforcement).
    const { error } = await this.client.rpc('memory_touch', { p_ids: ids });
    if (error) console.warn('[memory] touch failed:', error.message);
  }

  async promote(id: string, visibility: MemoryVisibility): Promise<void> {
    await this.client
      .from('memories')
      .update({ visibility, updated_at: new Date().toISOString() })
      .eq('id', id);
  }

  async touchEntities(scope: MemoryScope, entities: EntityWrite[]): Promise<void> {
    for (const e of entities) {
      const norm = normalizeEntityName(e.name);
      const { data: existing } = await this.client
        .from('entities')
        .select('id, occurrence_count, importance')
        .eq('user_id', scope.userId)
        .eq('normalized_name', norm)
        .maybeSingle();
      if (existing) {
        await this.client
          .from('entities')
          .update({
            occurrence_count: (existing.occurrence_count as number) + 1,
            importance: Math.min(10, (existing.importance as number) + 1),
            last_seen: new Date().toISOString(),
          })
          .eq('id', existing.id);
      } else {
        await this.client.from('entities').insert({
          user_id: scope.userId,
          project_id: scope.projectId ?? null,
          name: e.name,
          normalized_name: norm,
          type: e.type ?? null,
        });
      }
    }
  }

  async entitySalience(
    scope: MemoryScope,
    normalizedNames: string[]
  ): Promise<Record<string, number>> {
    if (normalizedNames.length === 0) return {};
    const { data } = await this.client
      .from('entities')
      .select('normalized_name, occurrence_count')
      .eq('user_id', scope.userId)
      .in('normalized_name', normalizedNames);
    const out: Record<string, number> = {};
    for (const r of (data as { normalized_name: string; occurrence_count: number }[]) ?? []) {
      out[r.normalized_name] = r.occurrence_count;
    }
    return out;
  }

  async archive(id: string): Promise<void> {
    await this.client
      .from('memories')
      .update({ invalid_at: new Date().toISOString(), expires_at: new Date().toISOString() })
      .eq('id', id);
  }

  async purgeExpiredArchives(graceDays: number): Promise<number> {
    const cutoff = new Date(Date.now() - graceDays * 86_400_000).toISOString();
    const { data } = await this.client.from('memories').delete().lt('expires_at', cutoff).select('id');
    return (data as unknown[] | null)?.length ?? 0;
  }

  async decay(): Promise<void> {
    // Lazy/no-op server-side for Phase 1; reinforcement via touch() + ranking handles relevance.
  }

  async usage(scope: MemoryScope): Promise<UsageStats> {
    const m = await this.client
      .from('memories').select('id', { count: 'exact', head: true }).eq('user_id', scope.userId);
    const e = await this.client
      .from('entities').select('id', { count: 'exact', head: true }).eq('user_id', scope.userId);
    return { memories: m.count ?? 0, entities: e.count ?? 0, bytes: 0 };
  }

  async listAll(scope: MemoryScope): Promise<MemoryRecord[]> {
    const { data } = await this.client
      .from('memories').select('*')
      .eq('user_id', scope.userId).is('invalid_at', null)
      .order('created_at', { ascending: false });
    return ((data as Record<string, unknown>[]) ?? []).map(rowToRecord);
  }
}
