import { OpenAICompatibleProvider } from './openai-compatible';
import type { AIModel } from './types';

// OpenRouter is a gateway to many providers' models via one key; ids are namespaced.
export const OPENROUTER_MODELS: AIModel[] = [
  {
    id: 'openrouter/auto',
    name: 'Auto (OpenRouter)',
    provider: 'openrouter',
    description: 'OpenRouter picks a strong model automatically',
    contextWindow: 128000,
    maxOutput: 8192,
  },
  {
    id: 'anthropic/claude-3.5-sonnet',
    name: 'Claude 3.5 Sonnet (OpenRouter)',
    provider: 'openrouter',
    description: 'Anthropic Claude 3.5 Sonnet via OpenRouter',
    contextWindow: 200000,
    maxOutput: 8192,
  },
  {
    id: 'meta-llama/llama-3.3-70b-instruct',
    name: 'Llama 3.3 70B (OpenRouter)',
    provider: 'openrouter',
    description: 'Meta Llama 3.3 70B via OpenRouter',
    contextWindow: 128000,
    maxOutput: 8192,
  },
];

export class OpenRouterProvider extends OpenAICompatibleProvider {
  constructor() {
    super('openrouter', 'https://openrouter.ai/api/v1', OPENROUTER_MODELS, {
      'HTTP-Referer': 'https://lucy.ai',
      'X-Title': 'Lucy AI',
    });
  }
}
