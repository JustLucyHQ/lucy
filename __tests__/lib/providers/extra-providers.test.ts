import { GroqProvider } from '@/lib/providers/groq';
import { MistralProvider } from '@/lib/providers/mistral';
import { XaiProvider } from '@/lib/providers/xai';
import { OpenRouterProvider } from '@/lib/providers/openrouter';

// Mock the OpenAI SDK so these modules load cleanly under jsdom.
jest.mock('openai', () =>
  jest.fn().mockImplementation(() => ({
    chat: { completions: { create: jest.fn() } },
    models: { list: jest.fn() },
  }))
);

describe('OpenAI-compatible chat providers', () => {
  const cases: Array<[string, new () => { name: string; models: { provider: string }[] }]> = [
    ['groq', GroqProvider],
    ['mistral', MistralProvider],
    ['xai', XaiProvider],
    ['openrouter', OpenRouterProvider],
  ];

  it.each(cases)('%s exposes its name and tags every model', (name, Provider) => {
    const p = new Provider();
    expect(p.name).toBe(name);
    expect(p.models.length).toBeGreaterThan(0);
    p.models.forEach((m) => expect(m.provider).toBe(name));
  });
});
