import { OpenAIProvider } from './openai';
import { AnthropicProvider } from './anthropic';
import { GeminiProvider } from './gemini';
import { DeepSeekProvider } from './deepseek';
import { GroqProvider } from './groq';
import { MistralProvider } from './mistral';
import { XaiProvider } from './xai';
import { OpenRouterProvider } from './openrouter';
import { LocalProvider } from './local';
import type { AIProvider, AIModel, ProviderName } from './types';

export type { AIProvider, AIModel, ChatMessage, StreamCallback, ProviderConfig, ProviderName } from './types';
export { ALL_MODELS } from './types';
export { LocalProvider, OLLAMA_DEFAULT_URL, LM_STUDIO_DEFAULT_URL } from './local';
export type { LocalModelInfo, LocalProviderStatus } from './local';

// Singleton provider instances
const providers: Record<ProviderName, AIProvider> = {
  openai: new OpenAIProvider(),
  anthropic: new AnthropicProvider(),
  google: new GeminiProvider(),
  deepseek: new DeepSeekProvider(),
  groq: new GroqProvider(),
  mistral: new MistralProvider(),
  xai: new XaiProvider(),
  openrouter: new OpenRouterProvider(),
  local: new LocalProvider(),
};

export function getProvider(name: ProviderName): AIProvider {
  const provider = providers[name];
  if (!provider) {
    throw new Error(`Unknown provider: ${name}`);
  }
  return provider;
}

export function getProviderForModel(modelId: string): AIProvider {
  for (const provider of Object.values(providers)) {
    if (provider.models.some((m) => m.id === modelId)) {
      return provider;
    }
  }
  throw new Error(`No provider found for model: ${modelId}`);
}

export function getAllModels(): AIModel[] {
  return Object.values(providers).flatMap((p) => p.models);
}

export function getModelById(modelId: string): AIModel | undefined {
  return getAllModels().find((m) => m.id === modelId);
}

export function getModelsByProvider(): Record<ProviderName, AIModel[]> {
  return {
    openai: providers.openai.models,
    anthropic: providers.anthropic.models,
    google: providers.google.models,
    deepseek: providers.deepseek.models,
    groq: providers.groq.models,
    mistral: providers.mistral.models,
    xai: providers.xai.models,
    openrouter: providers.openrouter.models,
    local: providers.local.models,
  };
}

/**
 * Updates the local provider's model list after dynamic discovery.
 * Called from the settings page after a successful "Detect Models" response.
 */
export function setLocalModels(models: AIModel[]) {
  (providers.local as LocalProvider).setModels(models);
}
