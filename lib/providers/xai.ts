import { OpenAICompatibleProvider } from './openai-compatible';
import type { AIModel } from './types';

export const XAI_MODELS: AIModel[] = [
  {
    id: 'grok-2-latest',
    name: 'Grok 2',
    provider: 'xai',
    description: "xAI's Grok 2 flagship model",
    contextWindow: 131072,
    maxOutput: 8192,
  },
  {
    id: 'grok-beta',
    name: 'Grok Beta',
    provider: 'xai',
    description: 'xAI Grok beta model',
    contextWindow: 131072,
    maxOutput: 8192,
  },
];

export class XaiProvider extends OpenAICompatibleProvider {
  constructor() {
    super('xai', 'https://api.x.ai/v1', XAI_MODELS);
  }
}
