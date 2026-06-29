import { DeepSeekProvider } from '@/lib/providers/deepseek';

// Mock the OpenAI SDK so the module loads cleanly under jsdom (no node shims).
jest.mock('openai', () =>
  jest.fn().mockImplementation(() => ({
    chat: { completions: { create: jest.fn() } },
    models: { list: jest.fn() },
  }))
);

describe('DeepSeekProvider', () => {
  it('has name "deepseek"', () => {
    expect(new DeepSeekProvider().name).toBe('deepseek');
  });

  it('exposes deepseek-chat and deepseek-reasoner models', () => {
    const ids = new DeepSeekProvider().models.map((m) => m.id);
    expect(ids).toContain('deepseek-chat');
    expect(ids).toContain('deepseek-reasoner');
  });

  it('every model is tagged provider "deepseek"', () => {
    new DeepSeekProvider().models.forEach((m) => expect(m.provider).toBe('deepseek'));
  });
});
