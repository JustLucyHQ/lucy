/**
 * Tests for lib/providers/index.ts
 *
 * Covers: getProvider, getProviderForModel, getAllModels, getModelsByProvider
 */

import {
  getProvider,
  getProviderForModel,
  getAllModels,
  getModelsByProvider,
} from '@/lib/providers';

// ── Mock the heavyweight SDK classes so tests don't need real API keys ──────

jest.mock('@/lib/providers/openai', () => ({
  OpenAIProvider: jest.fn().mockImplementation(() => ({
    name: 'openai',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', description: '', contextWindow: 128000, maxOutput: 4096 },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', description: '', contextWindow: 128000, maxOutput: 16384 },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', provider: 'openai', description: '', contextWindow: 16385, maxOutput: 4096 },
    ],
    chat: jest.fn(),
    testConnection: jest.fn(),
  })),
}));

jest.mock('@/lib/providers/anthropic', () => ({
  AnthropicProvider: jest.fn().mockImplementation(() => ({
    name: 'anthropic',
    models: [
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', provider: 'anthropic', description: '', contextWindow: 1000000, maxOutput: 8096 },
      { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', provider: 'anthropic', description: '', contextWindow: 200000, maxOutput: 8096 },
    ],
    chat: jest.fn(),
    testConnection: jest.fn(),
  })),
}));

jest.mock('@/lib/providers/gemini', () => ({
  GeminiProvider: jest.fn().mockImplementation(() => ({
    name: 'google',
    models: [
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'google', description: '', contextWindow: 1048576, maxOutput: 8192 },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'google', description: '', contextWindow: 2097152, maxOutput: 8192 },
    ],
    chat: jest.fn(),
    testConnection: jest.fn(),
  })),
}));

jest.mock('@/lib/providers/deepseek', () => ({
  DeepSeekProvider: jest.fn().mockImplementation(() => ({
    name: 'deepseek',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek V3 (Chat)', provider: 'deepseek', description: '', contextWindow: 64000, maxOutput: 8192 },
      { id: 'deepseek-reasoner', name: 'DeepSeek R1 (Reasoner)', provider: 'deepseek', description: '', contextWindow: 64000, maxOutput: 8192 },
    ],
    chat: jest.fn(),
    testConnection: jest.fn(),
  })),
}));

jest.mock('@/lib/providers/groq', () => ({
  GroqProvider: jest.fn().mockImplementation(() => ({
    name: 'groq',
    models: [{ id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B (Groq)', provider: 'groq', description: '', contextWindow: 128000, maxOutput: 32768 }],
    chat: jest.fn(),
    testConnection: jest.fn(),
  })),
}));

jest.mock('@/lib/providers/mistral', () => ({
  MistralProvider: jest.fn().mockImplementation(() => ({
    name: 'mistral',
    models: [{ id: 'mistral-large-latest', name: 'Mistral Large', provider: 'mistral', description: '', contextWindow: 131072, maxOutput: 8192 }],
    chat: jest.fn(),
    testConnection: jest.fn(),
  })),
}));

jest.mock('@/lib/providers/xai', () => ({
  XaiProvider: jest.fn().mockImplementation(() => ({
    name: 'xai',
    models: [{ id: 'grok-2-latest', name: 'Grok 2', provider: 'xai', description: '', contextWindow: 131072, maxOutput: 8192 }],
    chat: jest.fn(),
    testConnection: jest.fn(),
  })),
}));

jest.mock('@/lib/providers/openrouter', () => ({
  OpenRouterProvider: jest.fn().mockImplementation(() => ({
    name: 'openrouter',
    models: [{ id: 'openrouter/auto', name: 'Auto (OpenRouter)', provider: 'openrouter', description: '', contextWindow: 128000, maxOutput: 8192 }],
    chat: jest.fn(),
    testConnection: jest.fn(),
  })),
}));

jest.mock('@/lib/providers/local', () => ({
  LocalProvider: jest.fn().mockImplementation(() => ({
    name: 'local',
    models: [
      { id: 'ollama/llama3.1', name: 'Llama 3.1 (Local)', provider: 'local', description: '', contextWindow: 131072, maxOutput: 8192 },
    ],
    chat: jest.fn(),
    testConnection: jest.fn(),
    setModels: jest.fn(),
  })),
  OLLAMA_DEFAULT_URL: 'http://localhost:11434',
  LM_STUDIO_DEFAULT_URL: 'http://localhost:1234',
}));

// ── Tests ────────────────────────────────────────────────────────────────────

describe('lib/providers/index', () => {
  describe('getProvider', () => {
    it('returns the openai provider', () => {
      const provider = getProvider('openai');
      expect(provider.name).toBe('openai');
    });

    it('returns the anthropic provider', () => {
      const provider = getProvider('anthropic');
      expect(provider.name).toBe('anthropic');
    });

    it('returns the google provider', () => {
      const provider = getProvider('google');
      expect(provider.name).toBe('google');
    });

    it('returns the local provider', () => {
      const provider = getProvider('local');
      expect(provider.name).toBe('local');
    });

    it('throws for an unknown provider name', () => {
      expect(() => getProvider('unknown' as never)).toThrow('Unknown provider');
    });
  });

  describe('getProviderForModel', () => {
    it('returns the openai provider for gpt-4o', () => {
      const provider = getProviderForModel('gpt-4o');
      expect(provider.name).toBe('openai');
    });

    it('returns the anthropic provider for claude-sonnet-4-6', () => {
      const provider = getProviderForModel('claude-sonnet-4-6');
      expect(provider.name).toBe('anthropic');
    });

    it('returns the google provider for gemini-2.0-flash', () => {
      const provider = getProviderForModel('gemini-2.0-flash');
      expect(provider.name).toBe('google');
    });

    it('throws when model id is not found in any provider', () => {
      expect(() => getProviderForModel('nonexistent-model')).toThrow('No provider found');
    });
  });

  describe('getAllModels', () => {
    it('returns an array of models from all providers', () => {
      const models = getAllModels();
      expect(Array.isArray(models)).toBe(true);
      expect(models.length).toBeGreaterThan(0);
    });

    it('includes models from openai, anthropic and google', () => {
      const models = getAllModels();
      const providers = models.map((m) => m.provider);
      expect(providers).toContain('openai');
      expect(providers).toContain('anthropic');
      expect(providers).toContain('google');
    });

    it('includes gpt-4o in the full list', () => {
      const models = getAllModels();
      const ids = models.map((m) => m.id);
      expect(ids).toContain('gpt-4o');
    });
  });

  describe('getModelsByProvider', () => {
    it('returns a map keyed by provider name', () => {
      const byProvider = getModelsByProvider();
      expect(byProvider).toHaveProperty('openai');
      expect(byProvider).toHaveProperty('anthropic');
      expect(byProvider).toHaveProperty('google');
      expect(byProvider).toHaveProperty('local');
    });

    it('filters openai models correctly', () => {
      const { openai } = getModelsByProvider();
      expect(openai.length).toBeGreaterThan(0);
      openai.forEach((m) => expect(m.provider).toBe('openai'));
    });

    it('filters anthropic models correctly', () => {
      const { anthropic } = getModelsByProvider();
      expect(anthropic.length).toBeGreaterThan(0);
      anthropic.forEach((m) => expect(m.provider).toBe('anthropic'));
    });

    it('filters google models correctly', () => {
      const { google } = getModelsByProvider();
      expect(google.length).toBeGreaterThan(0);
      google.forEach((m) => expect(m.provider).toBe('google'));
    });
  });
});
