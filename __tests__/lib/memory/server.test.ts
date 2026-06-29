import { buildRetrievalBlock } from '@/lib/memory/server';
import { LocalMemoryStore, type MemoryKV } from '@/lib/memory/local-store';

function kv(): MemoryKV {
  const m = new Map<string, string>();
  return { get: async (k) => m.get(k) ?? null, set: async (k, v) => void m.set(k, v) };
}

describe('buildRetrievalBlock', () => {
  it('returns profile + retrieved memories as a prompt block', async () => {
    const store = new LocalMemoryStore(kv());
    const scope = { userId: 'u1', projectId: null };
    await store.upsertProfile(scope, { name: 'Johnny' });
    await store.store(scope, [{ type: 'semantic', content: 'Acme uses Postgres' }]);
    const { block, count } = await buildRetrievalBlock(store, scope, 'tell me about acme postgres');
    expect(block).toContain('Johnny');
    expect(block).toContain('Acme');
    expect(count).toBe(1);
  });

  it('returns empty string + zero count when store has nothing relevant', async () => {
    const store = new LocalMemoryStore(kv());
    const { block, count } = await buildRetrievalBlock(store, { userId: 'u1', projectId: null }, 'unrelated');
    expect(block).toBe('');
    expect(count).toBe(0);
  });
});
