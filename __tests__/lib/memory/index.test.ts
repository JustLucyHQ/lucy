import { ingestExtraction } from '@/lib/memory/index';
import { LocalMemoryStore, type MemoryKV } from '@/lib/memory/local-store';

// index.ts pulls in supabase-store -> embeddings -> openai; mock the SDK for jsdom.
jest.mock('openai', () =>
  jest.fn().mockImplementation(() => ({ embeddings: { create: jest.fn() } }))
);

function memoryKV(): MemoryKV {
  const m = new Map<string, string>();
  return { get: async (k) => m.get(k) ?? null, set: async (k, v) => void m.set(k, v) };
}
const scope = { userId: 'u1', projectId: null };

describe('ingestExtraction', () => {
  it('writes memories, entities and profile patch to the store', async () => {
    const store = new LocalMemoryStore(memoryKV());
    await ingestExtraction(store, scope, {
      memories: [{ op: 'ADD', type: 'semantic', content: 'Acme uses Postgres', importance: 7 }],
      entities: [{ name: 'Acme', type: 'client' }],
      profilePatch: { company: 'Acme' },
    }, 'conv1');
    const all = await store.listAll(scope);
    expect(all).toHaveLength(1);
    expect(all[0].sourceConversationId).toBe('conv1');
    const profile = await store.getProfile(scope);
    expect(profile?.data.company).toBe('Acme');
  });

  it('boosts importance for memories mentioning a recurring (high-salience) entity', async () => {
    const store = new LocalMemoryStore(memoryKV());
    // Simulate "Acme" recurring across many prior conversations.
    for (let i = 0; i < 20; i++) await store.touchEntities(scope, [{ name: 'Acme' }]);
    await ingestExtraction(
      store,
      scope,
      {
        memories: [{ op: 'ADD', type: 'semantic', content: 'Acme switched to Postgres', importance: 5 }],
        entities: [{ name: 'Acme' }],
        profilePatch: {},
      },
      'conv2'
    );
    const all = await store.listAll(scope);
    expect(all[0].importance).toBeGreaterThan(5); // salience lifted it above the base
  });
});
