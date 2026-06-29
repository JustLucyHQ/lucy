import { LocalMemoryStore, type MemoryKV } from '@/lib/memory/local-store';

function memoryKV(): MemoryKV {
  const m = new Map<string, string>();
  return {
    get: async (k) => m.get(k) ?? null,
    set: async (k, v) => void m.set(k, v),
  };
}

const scope = { userId: 'u1', projectId: null };

describe('LocalMemoryStore', () => {
  it('stores and lexically searches memories', async () => {
    const store = new LocalMemoryStore(memoryKV());
    await store.store(scope, [
      { type: 'semantic', content: 'Acme runs on Postgres' },
      { type: 'semantic', content: 'User prefers dark mode' },
    ]);
    const hits = await store.search(scope, 'postgres database', { limit: 5 });
    expect(hits[0].content).toContain('Acme');
  });

  it('upserts and merges the profile', async () => {
    const store = new LocalMemoryStore(memoryKV());
    await store.upsertProfile(scope, { name: 'Johnny' });
    await store.upsertProfile(scope, { role: 'founder' });
    const p = await store.getProfile(scope);
    expect(p?.data).toEqual({ name: 'Johnny', role: 'founder' });
  });

  it('bumps entity occurrence_count on repeat', async () => {
    const store = new LocalMemoryStore(memoryKV());
    await store.touchEntities(scope, [{ name: 'Acme Corp', type: 'client' }]);
    await store.touchEntities(scope, [{ name: 'acme corp' }]);
    const usage = await store.usage(scope);
    expect(usage.entities).toBe(1);
  });

  it('reports usage counts', async () => {
    const store = new LocalMemoryStore(memoryKV());
    await store.store(scope, [{ type: 'semantic', content: 'x' }]);
    const usage = await store.usage(scope);
    expect(usage.memories).toBe(1);
    expect(usage.bytes).toBeGreaterThan(0);
  });

  it('reconcile UPDATE supersedes in place (supersede policy)', async () => {
    const store = new LocalMemoryStore(memoryKV());
    const [rec] = await store.store(scope, [{ type: 'semantic', content: 'User prefers Python' }]);
    await store.reconcile(
      scope,
      [{ op: 'UPDATE', targetId: rec.id, type: 'semantic', content: 'User prefers TypeScript', importance: 8 }],
      'supersede'
    );
    const all = await store.listAll(scope);
    expect(all).toHaveLength(1);
    expect(all[0].content).toBe('User prefers TypeScript');
    expect(all[0].id).toBe(rec.id);
  });

  it('reconcile UPDATE keeps history (keep_history policy)', async () => {
    const store = new LocalMemoryStore(memoryKV());
    const [rec] = await store.store(scope, [{ type: 'semantic', content: 'User prefers Python' }]);
    await store.reconcile(
      scope,
      [{ op: 'UPDATE', targetId: rec.id, type: 'semantic', content: 'User prefers TypeScript', importance: 8 }],
      'keep_history'
    );
    const all = await store.listAll(scope);
    expect(all).toHaveLength(1); // invalidated old excluded
    expect(all[0].content).toBe('User prefers TypeScript');
    expect(all[0].id).not.toBe(rec.id); // a new row, old kept-but-invalidated
  });

  it('reconcile ADD inserts a new memory', async () => {
    const store = new LocalMemoryStore(memoryKV());
    await store.reconcile(scope, [{ op: 'ADD', type: 'semantic', content: 'New fact' }], 'supersede');
    const all = await store.listAll(scope);
    expect(all).toHaveLength(1);
  });

  it('archive removes a memory from search', async () => {
    const store = new LocalMemoryStore(memoryKV());
    const [rec] = await store.store(scope, [{ type: 'semantic', content: 'secret plan' }]);
    await store.archive(rec.id);
    const hits = await store.search(scope, 'secret', { limit: 5 });
    expect(hits.find((h) => h.id === rec.id)).toBeUndefined();
  });
});
