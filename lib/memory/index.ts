import type { SupabaseClient } from '@supabase/supabase-js';
import type { MemoryStore } from './store';
import type { EmbedderConfig } from './embeddings';
import type {
  ExtractionResult, MemoryScope, ReconcileWrite, ContradictionPolicy,
} from './types';
import { computeImportance } from './scoring';
import { normalizeEntityName } from './profile';
import { SupabaseMemoryStore } from './supabase-store';
import { LocalMemoryStore } from './local-store';
import { createIndexedDBKV } from './indexeddb-kv';

export * from './types';
export { parseMemoryCommand } from './commands';
export { buildMemoryBlock } from './injector';
export { buildRetrievalBlock } from './server';
export type { MemoryStore } from './store';

export interface CreateStoreOptions {
  client?: SupabaseClient | null;
  embedder?: EmbedderConfig;
}

/** Pick the right backend: Supabase when a client is provided, else local IndexedDB. */
export function createMemoryStore(opts: CreateStoreOptions): MemoryStore {
  if (opts.client) {
    return new SupabaseMemoryStore(opts.client, opts.embedder ?? { apiKey: '' });
  }
  return new LocalMemoryStore(createIndexedDBKV());
}

/** Apply a validated extraction result to a store, honoring reconciliation ops. */
export async function ingestExtraction(
  store: MemoryStore,
  scope: MemoryScope,
  result: ExtractionResult,
  conversationId: string | null,
  policy: ContradictionPolicy = 'supersede'
): Promise<void> {
  // Bump entity occurrence counts first, then read salience so recurring terms
  // (e.g. a client name seen across many chats) raise the importance of memories
  // that mention them.
  if (result.entities.length) await store.touchEntities(scope, result.entities);
  const salience = result.entities.length
    ? await store.entitySalience(scope, result.entities.map((e) => normalizeEntityName(e.name)))
    : {};
  const salienceFor = (content: string): number => {
    const lower = content.toLowerCase();
    let bonus = 0;
    for (const [name, count] of Object.entries(salience)) {
      if (name && lower.includes(name)) bonus += count;
    }
    return bonus;
  };

  const items: ReconcileWrite[] = result.memories.map((m) => ({
    // SKIP is already filtered out by the extractor; coerce defensively.
    op: m.op === 'SKIP' ? 'ADD' : m.op,
    targetId: m.id,
    type: m.type,
    category: m.category,
    content: m.content,
    summary: m.summary,
    importance: computeImportance(m.importance, 'extracted', salienceFor(m.content)),
    source: 'extracted',
    sourceConversationId: conversationId,
  }));
  if (items.length) await store.reconcile(scope, items, policy);
  // Memories are already persisted; a profile-write failure must not discard that.
  if (Object.keys(result.profilePatch).length) {
    try {
      await store.upsertProfile(scope, result.profilePatch);
    } catch (e) {
      console.warn(
        '[memory] profile update failed after memories stored:',
        e instanceof Error ? e.message : String(e)
      );
    }
  }
}

/** Apply a /remember or /global command immediately. */
export async function ingestCommand(
  store: MemoryStore,
  scope: MemoryScope,
  kind: 'remember' | 'global',
  text: string,
  conversationId: string | null
): Promise<void> {
  await store.store(scope, [{
    type: 'semantic',
    content: text,
    importance: computeImportance(8, kind === 'global' ? 'user_global' : 'user_remember'),
    visibility: kind === 'global' ? 'global' : 'private',
    source: kind === 'global' ? 'user_global' : 'user_remember',
    sourceConversationId: conversationId,
  }]);
}
