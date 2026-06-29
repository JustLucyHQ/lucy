import type { MemoryStore } from './store';
import type { MemoryScope } from './types';
import { buildMemoryBlock } from './injector';

const DEFAULT_BUDGET_ITEMS = 12;

export interface RetrievalResult {
  block: string;
  /** Number of collection memories injected (for the "used N" transparency badge). */
  count: number;
}

/** Retrieve profile + top memories and format them as a system-prompt block. */
export async function buildRetrievalBlock(
  store: MemoryStore,
  scope: MemoryScope,
  query: string,
  limit = DEFAULT_BUDGET_ITEMS
): Promise<RetrievalResult> {
  const [profile, memories] = await Promise.all([
    store.getProfile(scope),
    store.search(scope, query, { limit }),
  ]);
  if (memories.length) {
    void store.touch(memories.map((m) => m.id));
  }
  // Lazy decay: prune stale low-value memories on access (fire-and-forget).
  void store.decay(scope);
  return { block: buildMemoryBlock(profile, memories), count: memories.length };
}
