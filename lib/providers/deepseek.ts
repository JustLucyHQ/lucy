import OpenAI from 'openai';
import type { AIProvider, AIModel, ChatMessage, StreamCallback, ProviderConfig } from './types';

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';

const DEEPSEEK_MODELS: AIModel[] = [
  {
    id: 'deepseek-chat',
    name: 'DeepSeek V3 (Chat)',
    provider: 'deepseek',
    description: 'General-purpose DeepSeek chat model — fast and inexpensive',
    contextWindow: 64000,
    maxOutput: 8192,
  },
  {
    id: 'deepseek-reasoner',
    name: 'DeepSeek R1 (Reasoner)',
    provider: 'deepseek',
    description: 'DeepSeek reasoning model with chain-of-thought',
    contextWindow: 64000,
    maxOutput: 8192,
  },
];

export class DeepSeekProvider implements AIProvider {
  name = 'deepseek' as const;
  models = DEEPSEEK_MODELS;

  async chat(
    messages: ChatMessage[],
    modelId: string,
    onChunk: StreamCallback,
    config: ProviderConfig
  ): Promise<void> {
    const client = new OpenAI({ apiKey: config.apiKey, baseURL: DEEPSEEK_BASE_URL });

    const stream = await client.chat.completions.create({
      model: modelId,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) onChunk(delta);
    }
  }

  async testConnection(config: ProviderConfig): Promise<boolean> {
    try {
      const client = new OpenAI({ apiKey: config.apiKey, baseURL: DEEPSEEK_BASE_URL });
      await client.models.list();
      return true;
    } catch {
      return false;
    }
  }
}
