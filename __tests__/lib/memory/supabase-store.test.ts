import { SupabaseMemoryStore } from '@/lib/memory/supabase-store';

// supabase-store imports ./embeddings which imports the OpenAI SDK; mock it for jsdom.
jest.mock('openai', () =>
  jest.fn().mockImplementation(() => ({
    embeddings: { create: jest.fn() },
  }))
);

function fakeClient() {
  const rows: Record<string, unknown>[] = [];
  return {
    rows,
    from() {
      return {
        insert(payload: Record<string, unknown>[]) {
          rows.push(...payload);
          return {
            select: () => ({ data: payload.map((p, i) => ({ ...p, id: `id_${i}` })), error: null }),
          };
        },
        upsert() {
          return { error: null };
        },
        select() {
          return { eq: () => ({ data: rows, error: null }) };
        },
      };
    },
    rpc() {
      return { data: [], error: null };
    },
  };
}

describe('SupabaseMemoryStore', () => {
  it('store() maps writes to lucy.memories rows', async () => {
    const client = fakeClient();
    const store = new SupabaseMemoryStore(client as never, { apiKey: '' });
    const recs = await store.store({ userId: 'u1', projectId: null }, [
      { type: 'semantic', content: 'Acme runs on Postgres', importance: 7 },
    ]);
    expect(recs[0].content).toBe('Acme runs on Postgres');
    expect(client.rows[0].type).toBe('semantic');
  });

  it('search() returns [] gracefully when rpc yields nothing', async () => {
    const client = fakeClient();
    const store = new SupabaseMemoryStore(client as never, { apiKey: '' });
    const hits = await store.search({ userId: 'u1', projectId: null }, 'postgres');
    expect(hits).toEqual([]);
  });
});
