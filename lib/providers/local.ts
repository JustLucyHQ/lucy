/**
 * LocalProvider — connects to Ollama or LM Studio via their OpenAI-compatible APIs.
 *
 * Both servers expose OpenAI-style endpoints at localhost:
 *   Ollama:    http://localhost:11434/v1
 *   LM Studio: http://localhost:1234/v1
 *
 * No API key is required for Ollama. LM Studio accepts an optional key.
 * Connection errors are caught gracefully so the rest of Lucy keeps working.
 */

import OpenAI from 'openai';
import type { AIProvider, AIModel, ChatMessage, StreamCallback, ProviderConfig } from './types';

// ── Defaults ──────────────────────────────────────────────────────────────────

export const OLLAMA_DEFAULT_URL = 'http://localhost:11434';
export const LM_STUDIO_DEFAULT_URL = 'http://localhost:1234';

// Static fallback models — shown even before a "Detect Models" call succeeds.
// The prefix "ollama/" helps the engine route to the right backend.
export const LOCAL_STATIC_MODELS: AIModel[] = [
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

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LocalModelInfo {
  id: string;
  name: string;
  source: 'ollama' | 'lmstudio';
}

export interface LocalProviderStatus {
  ollama: { available: boolean; models: LocalModelInfo[] };
  lmstudio: { available: boolean; models: LocalModelInfo[] };
}

// ── Helper ────────────────────────────────────────────────────────────────────

/**
 * Strips the "ollama/" or "lmstudio/" routing prefix from a model ID to get
 * the bare model name expected by the OpenAI-compatible endpoint.
 */
function stripPrefix(modelId: string): string {
  return modelId.replace(/^(ollama|lmstudio)\//, '');
}

/**
 * Resolves the base URL for a given model ID:
 *   "ollama/*"    -> ollamaUrl/v1
 *   "lmstudio/*"  -> lmStudioUrl/v1
 *   anything else -> ollamaUrl/v1 (safe fallback)
 */
function resolveBaseUrl(
  modelId: string,
  ollamaUrl: string,
  lmStudioUrl: string
): string {
  const base = modelId.startsWith('lmstudio/')
    ? lmStudioUrl.replace(/\/$/, '')
    : ollamaUrl.replace(/\/$/, '');
  return `${base}/v1`;
}

// ── Provider ──────────────────────────────────────────────────────────────────

export class LocalProvider implements AIProvider {
  name = 'local' as const;
  models: AIModel[] = LOCAL_STATIC_MODELS;

  /** Update the model list after dynamic discovery. */
  setModels(models: AIModel[]) {
    this.models = models.length > 0 ? models : LOCAL_STATIC_MODELS;
  }

  async chat(
    messages: ChatMessage[],
    modelId: string,
    onChunk: StreamCallback,
    config: ProviderConfig & { ollamaUrl?: string; lmStudioUrl?: string }
  ): Promise<void> {
    const ollamaUrl = config.ollamaUrl ?? OLLAMA_DEFAULT_URL;
    const lmStudioUrl = config.lmStudioUrl ?? LM_STUDIO_DEFAULT_URL;
    const baseURL = resolveBaseUrl(modelId, ollamaUrl, lmStudioUrl);
    const bareModelId = stripPrefix(modelId);

    // apiKey is intentionally optional for local endpoints
    const client = new OpenAI({
      apiKey: config.apiKey || 'not-required',
      baseURL,
      // Disable automatic retries — connection failures should surface immediately
      maxRetries: 0,
    });

    try {
      const stream = await client.chat.completions.create({
        model: bareModelId,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        stream: true,
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          onChunk(delta);
        }
      }
    } catch (error) {
      // Wrap connection errors with a user-friendly hint
      const message =
        error instanceof Error ? error.message : String(error);

      if (
        message.includes('ECONNREFUSED') ||
        message.includes('fetch failed') ||
        message.includes('Failed to fetch') ||
        message.includes('connect ECONNREFUSED')
      ) {
        const service = modelId.startsWith('lmstudio/') ? 'LM Studio' : 'Ollama';
        throw new Error(
          `Cannot connect to ${service}. Is it running? (tried ${baseURL})`
        );
      }

      throw error;
    }
  }

  async testConnection(
    config: ProviderConfig & { ollamaUrl?: string; lmStudioUrl?: string }
  ): Promise<boolean> {
    const ollamaUrl = (config.ollamaUrl ?? OLLAMA_DEFAULT_URL).replace(/\/$/, '');
    try {
      const res = await fetch(`${ollamaUrl}/v1/models`, {
        signal: AbortSignal.timeout(3000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

// ── Discovery helpers (used server-side in /api/models) ───────────────────────

/**
 * Fetches the model list from a single OpenAI-compatible /v1/models endpoint.
 * Returns an empty array if the server is not running or returns an error.
 */
async function fetchModelsFromEndpoint(
  baseUrl: string,
  source: 'ollama' | 'lmstudio',
  timeoutMs = 3000
): Promise<LocalModelInfo[]> {
  try {
    const url = `${baseUrl.replace(/\/$/, '')}/v1/models`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) return [];

    const json = (await res.json()) as { data?: { id: string }[] };
    const data = json.data ?? [];

    return data.map((m) => ({
      id: `${source}/${m.id}`,
      name: `${m.id} (${source === 'ollama' ? 'Ollama' : 'LM Studio'})`,
      source,
    }));
  } catch {
    return [];
  }
}

/**
 * Discovers locally running models from both Ollama and LM Studio.
 * Safe to call in server-side code — never throws, always returns a valid object.
 */
export async function discoverLocalModels(
  ollamaUrl = OLLAMA_DEFAULT_URL,
  lmStudioUrl = LM_STUDIO_DEFAULT_URL
): Promise<LocalProviderStatus> {
  const [ollamaModels, lmstudioModels] = await Promise.all([
    fetchModelsFromEndpoint(ollamaUrl, 'ollama'),
    fetchModelsFromEndpoint(lmStudioUrl, 'lmstudio'),
  ]);

  return {
    ollama: { available: ollamaModels.length > 0, models: ollamaModels },
    lmstudio: { available: lmstudioModels.length > 0, models: lmstudioModels },
  };
}

/**
 * Converts discovered LocalModelInfo into full AIModel objects suitable for
 * inclusion in the ALL_MODELS list / model selector.
 */
export function localModelInfoToAIModel(info: LocalModelInfo): AIModel {
  return {
    id: info.id,
    name: info.name,
    provider: 'local',
    description: `Local model via ${info.source === 'ollama' ? 'Ollama' : 'LM Studio'}`,
    contextWindow: 32768,
    maxOutput: 4096,
  };
}
