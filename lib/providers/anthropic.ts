import Anthropic from '@anthropic-ai/sdk';
import type { AIProvider, AIModel, ChatMessage, StreamCallback, ProviderConfig } from './types';

const ANTHROPIC_MODELS: AIModel[] = [
  {
    id: 'claude-opus-4-8',
    name: 'Claude Opus 4.8',
    provider: 'anthropic',
    description: "Anthropic's most capable model — best for complex, long-horizon work",
    contextWindow: 1000000,
    maxOutput: 8096,
  },
  {
    id: 'claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6',
    provider: 'anthropic',
    description: 'Best balance of speed and intelligence',
    contextWindow: 1000000,
    maxOutput: 8096,
  },
  {
    id: 'claude-haiku-4-5',
    name: 'Claude Haiku 4.5',
    provider: 'anthropic',
    description: 'Fast and compact model for near-instant responsiveness',
    contextWindow: 200000,
    maxOutput: 8096,
  },
];

export class AnthropicProvider implements AIProvider {
  name = 'anthropic' as const;
  models = ANTHROPIC_MODELS;

  async chat(
    messages: ChatMessage[],
    modelId: string,
    onChunk: StreamCallback,
    config: ProviderConfig
  ): Promise<void> {
    const client = new Anthropic({ apiKey: config.apiKey });

    // Separate system message from conversation messages
    const systemMessage = messages.find((m) => m.role === 'system');
    const conversationMessages = messages.filter((m) => m.role !== 'system');

    // Opus 4.7+/4.8 and Fable/Mythos reject sampling params (400). Only send
    // `temperature` to models that accept it (Sonnet 4.6, Haiku 4.5, older).
    const rejectsTemperature = /^claude-(opus-4-(7|8)|fable|mythos)/.test(modelId);

    const stream = await client.messages.create({
      model: modelId,
      max_tokens: config.maxTokens ?? 8096,
      system: systemMessage?.content,
      messages: conversationMessages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      stream: true,
      ...(config.temperature !== undefined && !rejectsTemperature
        ? { temperature: config.temperature }
        : {}),
    });

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        onChunk(event.delta.text);
      }
    }
  }

  async testConnection(config: ProviderConfig): Promise<boolean> {
    try {
      const client = new Anthropic({ apiKey: config.apiKey });
      // Use a minimal message to test the connection
      await client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }],
      });
      return true;
    } catch {
      return false;
    }
  }
}
