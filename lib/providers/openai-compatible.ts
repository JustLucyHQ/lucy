import OpenAI from 'openai';
import type {
  AIProvider,
  AIModel,
  ChatMessage,
  StreamCallback,
  ProviderConfig,
  ProviderName,
} from './types';

/**
 * Base class for any provider that exposes an OpenAI-compatible API at a fixed
 * base URL (Groq, Mistral, xAI, OpenRouter, DeepSeek-style endpoints, etc.).
 * Subclasses just pass their name, base URL, and model list.
 */
export class OpenAICompatibleProvider implements AIProvider {
  readonly name: ProviderName;
  readonly models: AIModel[];
  private readonly baseURL: string;
  private readonly extraHeaders?: Record<string, string>;

  constructor(
    name: ProviderName,
    baseURL: string,
    models: AIModel[],
    extraHeaders?: Record<string, string>
  ) {
    this.name = name;
    this.baseURL = baseURL;
    this.models = models;
    this.extraHeaders = extraHeaders;
  }

  async chat(
    messages: ChatMessage[],
    modelId: string,
    onChunk: StreamCallback,
    config: ProviderConfig
  ): Promise<void> {
    const client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: this.baseURL,
      ...(this.extraHeaders ? { defaultHeaders: this.extraHeaders } : {}),
    });
    const stream = await client.chat.completions.create({
      model: modelId,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: true,
      ...(config.temperature !== undefined ? { temperature: config.temperature } : {}),
      ...(config.maxTokens !== undefined ? { max_tokens: config.maxTokens } : {}),
    });
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) onChunk(delta);
    }
  }

  async testConnection(config: ProviderConfig): Promise<boolean> {
    try {
      const client = new OpenAI({
        apiKey: config.apiKey,
        baseURL: this.baseURL,
        ...(this.extraHeaders ? { defaultHeaders: this.extraHeaders } : {}),
      });
      await client.models.list();
      return true;
    } catch {
      return false;
    }
  }
}
