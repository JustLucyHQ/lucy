import { OpenAICompatibleProvider } from './openai-compatible';
import type { AIModel } from './types';

export const MISTRAL_MODELS: AIModel[] = [
  {
    id: 'mistral-large-latest',
    name: 'Mistral Large',
    provider: 'mistral',
    description: "Mistral's flagship reasoning model",
    contextWindow: 131072,
    maxOutput: 8192,
  },
  {
    id: 'mistral-small-latest',
    name: 'Mistral Small',
    provider: 'mistral',
    description: 'Efficient, lower-cost Mistral model',
    contextWindow: 131072,
    maxOutput: 8192,
  },
];

export class MistralProvider extends OpenAICompatibleProvider {
  constructor() {
    super('mistral', 'https://api.mistral.ai/v1', MISTRAL_MODELS);
  }
}
