// "Global" memory is only a row with no owner. A user's /global note must stay with that user: another user of the
// same install must never get it back (security fix 2026-11-10, was a cross-user leak on shared installs).
import { readFileSync } from 'fs';
import { join } from 'path';
import { ingestCommand } from '@/lib/memory/index';
import { LocalMemoryStore, type MemoryKV } from '@/lib/memory/local-store';

jest.mock('openai', () =>
  jest.fn().mockImplementation(() => ({ embeddings: { create: jest.fn() } }))
);

function memoryKV(): MemoryKV {
  const m = new Map<string, string>();
  return { get: async (k) => m.get(k) ?? null, set: async (k, v) => void m.set(k, v) };
}
const alice = { userId: 'user-a', projectId: null };
const bob = { userId: 'user-b', projectId: null };
const ownerless = { userId: null, projectId: null };

describe('global memory scope', () => {
  it("does not show user A's global memory to user B", async () => {
    const store = new LocalMemoryStore(memoryKV());
    await store.store(alice, [{ type: 'semantic', content: 'Alice secret pricing plan', visibility: 'global', source: 'user_global' }]);
    expect(await store.search(bob, 'secret pricing plan')).toHaveLength(0);
    expect((await store.search(alice, 'secret pricing plan'))[0]?.content).toBe('Alice secret pricing plan');
  });

  it('still shows an ownerless global memory to every user', async () => {
    const store = new LocalMemoryStore(memoryKV());
    await store.store(ownerless, [{ type: 'semantic', content: 'Lucy answers in the user language', visibility: 'global', source: 'admin' }]);
    expect(await store.search(alice, 'answers user language')).toHaveLength(1);
    expect(await store.search(bob, 'answers user language')).toHaveLength(1);
  });

  it('saves a /global note as private to its author', async () => {
    const store = new LocalMemoryStore(memoryKV());
    await ingestCommand(store, alice, 'global', 'Our office opens at 8', null);
    const [saved] = await store.listAll(alice);
    expect(saved.visibility).toBe('private');
    expect(saved.source).toBe('user_global');
    expect(await store.search(bob, 'office opens')).toHaveLength(0);
  });

  it('only treats ownerless rows as global in the database search and read rules', () => {
    const sql = (f: string) => readFileSync(join(process.cwd(), 'lib/supabase', f), 'utf8');
    const search = sql('memory_search.sql');
    expect(search).not.toMatch(/or m\.visibility = 'global'\)/);
    expect(search.match(/m\.user_id is null and m\.visibility = 'global'/g)).toHaveLength(2);
    const fix = sql('memory_global_scope.sql');
    expect(fix).toMatch(/create policy "read memories" on lucy\.memories\s+for select using \(auth\.uid\(\) = user_id or \(user_id is null and visibility = 'global'\)\)/);
    expect(fix).toMatch(/create policy "read entities" on lucy\.entities\s+for select using \(auth\.uid\(\) = user_id or \(user_id is null and visibility = 'global'\)\)/);
  });
});
