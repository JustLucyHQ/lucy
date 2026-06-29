import OpenAI from 'openai';
import type { AIProvider, AIModel, ChatMessage, StreamCallback, ProviderConfig } from './types';

const OPENAI_MODELS: AIModel[] = [
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    description: 'Most capable OpenAI model, great for complex tasks',
    contextWindow: 128000,
    maxOutput: 4096,
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'openai',
    description: 'Affordable and intelligent small model for fast tasks',
    contextWindow: 128000,
    maxOutput: 16384,
  },
  {
    id: 'gpt-3.5-turbo',
    name: 'GPT-3.5 Turbo',
    provider: 'openai',
    description: 'Fast, inexpensive model for simple tasks',
    contextWindow: 16385,
    maxOutput: 4096,
  },
];

export class OpenAIProvider implements AIProvider {
  name = 'openai' as const;
  models = OPENAI_MODELS;

  async chat(
    messages: ChatMessage[],
    modelId: string,
    onChunk: StreamCallback,
    config: ProviderConfig
  ): Promise<void> {
    const client = new OpenAI({ apiKey: config.apiKey });

    const stream = await client.chat.completions.create({
      model: modelId,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      stream: true,
      ...(config.temperature !== undefined ? { temperature: config.temperature } : {}),
      ...(config.maxTokens !== undefined ? { max_tokens: config.maxTokens } : {}),
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        onChunk(delta);
      }
    }
  }

  async testConnection(config: ProviderConfig): Promise<boolean> {
    try {
      const client = new OpenAI({ apiKey: config.apiKey });
      await client.models.list();
      return true;
    } catch {
      return false;
    }
  }
}
