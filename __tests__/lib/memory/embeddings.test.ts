import { embedText, cosineSimilarity } from '@/lib/memory/embeddings';

const mockCreate = jest.fn();
jest.mock('openai', () =>
  jest.fn().mockImplementation(() => ({
    embeddings: { create: (...a: unknown[]) => mockCreate(...a) },
  }))
);

describe('embeddings', () => {
  beforeEach(() => mockCreate.mockReset());

  it('returns null when no api key is provided', async () => {
    const v = await embedText('hello', { apiKey: '' });
    expect(v).toBeNull();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('returns the embedding vector from the provider', async () => {
    mockCreate.mockResolvedValue({ data: [{ embedding: [0.1, 0.2, 0.3] }] });
    const v = await embedText('hello', { apiKey: 'sk-x' });
    expect(v).toEqual([0.1, 0.2, 0.3]);
  });

  it('returns null on provider error (graceful degradation)', async () => {
    mockCreate.mockRejectedValue(new Error('boom'));
    const v = await embedText('hello', { apiKey: 'sk-x' });
    expect(v).toBeNull();
  });

  it('uses the Cohere API shape when provider is cohere', async () => {
    const orig = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ embeddings: { float: [[0.5, 0.6, 0.7]] } }),
    }) as unknown as typeof fetch;
    const v = await embedText('hi', { apiKey: 'co-key', provider: 'cohere', model: 'embed-english-v3.0' });
    expect(v).toEqual([0.5, 0.6, 0.7]);
    expect(mockCreate).not.toHaveBeenCalled(); // did NOT use the OpenAI path
    global.fetch = orig;
  });

  it('cosineSimilarity is 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
  });

  it('cosineSimilarity is 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });
});
