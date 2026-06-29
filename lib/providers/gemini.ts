import { GoogleGenerativeAI } from '@google/generative-ai';
import type { AIProvider, AIModel, ChatMessage, StreamCallback, ProviderConfig } from './types';

const GEMINI_MODELS: AIModel[] = [
  {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    provider: 'google',
    description: 'Next generation speed and multimodal capabilities',
    contextWindow: 1048576,
    maxOutput: 8192,
  },
  {
    id: 'gemini-1.5-pro',
    name: 'Gemini 1.5 Pro',
    provider: 'google',
    description: 'Mid-size multimodal model with long context',
    contextWindow: 2097152,
    maxOutput: 8192,
  },
];

export class GeminiProvider implements AIProvider {
  name = 'google' as const;
  models = GEMINI_MODELS;

  async chat(
    messages: ChatMessage[],
    modelId: string,
    onChunk: StreamCallback,
    config: ProviderConfig
  ): Promise<void> {
    const genAI = new GoogleGenerativeAI(config.apiKey);
    const generationConfig: { temperature?: number; maxOutputTokens?: number } = {};
    if (config.temperature !== undefined) generationConfig.temperature = config.temperature;
    if (config.maxTokens !== undefined) generationConfig.maxOutputTokens = config.maxTokens;
    const model = genAI.getGenerativeModel({
      model: modelId,
      ...(Object.keys(generationConfig).length > 0 ? { generationConfig } : {}),
    });

    // Separate system prompt from conversation
    const systemMessage = messages.find((m) => m.role === 'system');
    const conversationMessages = messages.filter((m) => m.role !== 'system');

    // Build history (all but the last message)
    const history = conversationMessages.slice(0, -1).map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const lastMessage = conversationMessages[conversationMessages.length - 1];

    const chat = model.startChat({
      history,
      systemInstruction: systemMessage?.content,
    });

    const result = await chat.sendMessageStream(lastMessage.content);

    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) {
        onChunk(text);
      }
    }
  }

  async testConnection(config: ProviderConfig): Promise<boolean> {
    try {
      const genAI = new GoogleGenerativeAI(config.apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
      await model.generateContent('Hi');
      return true;
    } catch {
      return false;
    }
  }
}
