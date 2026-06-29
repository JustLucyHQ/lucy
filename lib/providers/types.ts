export type ProviderName =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'deepseek'
  | 'groq'
  | 'mistral'
  | 'xai'
  | 'openrouter'
  | 'local';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export type StreamCallback = (chunk: string) => void;

export interface ProviderConfig {
  apiKey: string;
  /** Optional sampling temperature. Honored where the provider/model supports it. */
  temperature?: number;
  /** Optional max output tokens for this request. */
  maxTokens?: number;
}

export interface AIModel {
  id: string;
  name: string;
  provider: ProviderName;
  description: string;
  contextWindow: number;
  maxOutput: number;
}

export interface AIProvider {
  name: ProviderName;
  models: AIModel[];
  chat(
    messages: ChatMessage[],
    modelId: string,
    onChunk: StreamCallback,
    config: ProviderConfig
  ): Promise<void>;
  testConnection(config: ProviderConfig): Promise<boolean>;
}

export const ALL_MODELS: AIModel[] = [
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
  {
    id: 'claude-opus-4-8',
    name: 'Claude Opus 4.8',
    provider: 'anthropic',
    description: 'Anthropic\'s most capable model — best for complex, long-horizon work',
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

  // ── Groq ──
  { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B (Groq)', provider: 'groq', description: 'Meta Llama 3.3 70B on Groq — very fast inference', contextWindow: 128000, maxOutput: 32768 },
  { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant (Groq)', provider: 'groq', description: 'Lightweight, near-instant Llama 3.1 8B on Groq', contextWindow: 128000, maxOutput: 8192 },
  { id: 'gemma2-9b-it', name: 'Gemma 2 9B (Groq)', provider: 'groq', description: 'Google Gemma 2 9B instruction-tuned on Groq', contextWindow: 8192, maxOutput: 8192 },

  // ── Mistral ──
  { id: 'mistral-large-latest', name: 'Mistral Large', provider: 'mistral', description: "Mistral's flagship reasoning model", contextWindow: 131072, maxOutput: 8192 },
  { id: 'mistral-small-latest', name: 'Mistral Small', provider: 'mistral', description: 'Efficient, lower-cost Mistral model', contextWindow: 131072, maxOutput: 8192 },

  // ── xAI (Grok) ──
  { id: 'grok-2-latest', name: 'Grok 2', provider: 'xai', description: "xAI's Grok 2 flagship model", contextWindow: 131072, maxOutput: 8192 },
  { id: 'grok-beta', name: 'Grok Beta', provider: 'xai', description: 'xAI Grok beta model', contextWindow: 131072, maxOutput: 8192 },

  // ── OpenRouter (gateway) ──
  { id: 'openrouter/auto', name: 'Auto (OpenRouter)', provider: 'openrouter', description: 'OpenRouter picks a strong model automatically', contextWindow: 128000, maxOutput: 8192 },
  { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet (OpenRouter)', provider: 'openrouter', description: 'Anthropic Claude 3.5 Sonnet via OpenRouter', contextWindow: 200000, maxOutput: 8192 },
  { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B (OpenRouter)', provider: 'openrouter', description: 'Meta Llama 3.3 70B via OpenRouter', contextWindow: 128000, maxOutput: 8192 },

  // ── Local / Ollama (static fallbacks — real list comes from /api/models?includeLocal=true) ──
  {
    id: 'ollama/llama3.1',
    name: 'Llama 3.1 (Local)',
    provider: 'local',
    description: 'Meta Llama 3.1 running locally via Ollama',
    contextWindow: 131072,
    maxOutput: 8192,
  },
  {
    id: 'ollama/mistral',
    name: 'Mistral (Local)',
    provider: 'local',
    description: 'Mistral 7B running locally via Ollama',
    contextWindow: 32768,
    maxOutput: 8192,
  },
  {
    id: 'ollama/codellama',
    name: 'Code Llama (Local)',
    provider: 'local',
    description: 'Meta Code Llama for coding tasks running locally via Ollama',
    contextWindow: 16384,
    maxOutput: 4096,
  },
  {
    id: 'ollama/phi3',
    name: 'Phi-3 (Local)',
    provider: 'local',
    description: 'Microsoft Phi-3 Mini running locally via Ollama',
    contextWindow: 131072,
    maxOutput: 4096,
  },
];
