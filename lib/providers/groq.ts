import { OpenAICompatibleProvider } from './openai-compatible';
import type { AIModel } from './types';

export const GROQ_MODELS: AIModel[] = [
  {
    id: 'llama-3.3-70b-versatile',
    name: 'Llama 3.3 70B (Groq)',
    provider: 'groq',
    description: 'Meta Llama 3.3 70B on Groq — very fast inference',
    contextWindow: 128000,
    maxOutput: 32768,
  },
  {
    id: 'llama-3.1-8b-instant',
    name: 'Llama 3.1 8B Instant (Groq)',
    provider: 'groq',
    description: 'Lightweight, near-instant Llama 3.1 8B on Groq',
    contextWindow: 128000,
    maxOutput: 8192,
  },
  {
    id: 'gemma2-9b-it',
    name: 'Gemma 2 9B (Groq)',
    provider: 'groq',
    description: 'Google Gemma 2 9B instruction-tuned on Groq',
    contextWindow: 8192,
    maxOutput: 8192,
  },
];

export class GroqProvider extends OpenAICompatibleProvider {
  constructor() {
    super('groq', 'https://api.groq.com/openai/v1', GROQ_MODELS);
  }
}
