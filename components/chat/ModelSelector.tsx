'use client';

import React, { useEffect, useState } from 'react';
import { ChevronDown, RefreshCw } from 'lucide-react';
import { getModelsByProvider, getModelById, setLocalModels } from '@/lib/providers';
import type { AIModel, ProviderName } from '@/lib/providers/types';

const PROVIDER_LABELS: Record<ProviderName, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  deepseek: 'DeepSeek',
  groq: 'Groq',
  mistral: 'Mistral',
  xai: 'xAI',
  openrouter: 'OpenRouter',
  local: 'Local',
};

/**
 * Providers the user actively uses — always selectable.
 * Claude (anthropic) + ChatGPT (openai); Local is rendered separately below.
 */
const PRIMARY_PROVIDERS: ProviderName[] = ['anthropic', 'openai'];

/**
 * Other providers — kept visible so users know they exist, but greyed out
 * (disabled) until configured. The `disabled` optgroup makes them unselectable.
 */
const SECONDARY_PROVIDERS: ProviderName[] = [
  'google', 'deepseek', 'groq', 'mistral', 'xai', 'openrouter',
];

interface ModelSelectorProps {
  selectedModel: string;
  onModelChange: (modelId: string, provider: ProviderName) => void;
  className?: string;
}

// The server-side probe of Ollama/LM Studio can take several seconds when
// neither is running, so the result is cached in sessionStorage across page
// navigations. `force` bypasses the cache (used by the re-detect button).
const LOCAL_MODELS_CACHE_KEY = 'lucy-local-models';
const LOCAL_MODELS_CACHE_TTL_MS = 60_000;

async function probeLocalModels(opts: { signal?: AbortSignal; force?: boolean } = {}): Promise<AIModel[]> {
  if (!opts.force) {
    try {
      const cached = sessionStorage.getItem(LOCAL_MODELS_CACHE_KEY);
      if (cached) {
        const { ts, models } = JSON.parse(cached) as { ts: number; models: AIModel[] };
        if (Date.now() - ts < LOCAL_MODELS_CACHE_TTL_MS) return models;
      }
    } catch {
      // Bad cache entry — fall through to a fresh probe
    }
  }

  const res = await fetch('/api/models?includeLocal=true', { signal: opts.signal });
  if (!res.ok) return [];

  const data = (await res.json()) as {
    byProvider: { local: AIModel[] };
    localStatus?: {
      ollama: { available: boolean };
      lmstudio: { available: boolean };
    };
  };

  const discovered: AIModel[] = data.byProvider?.local ?? [];
  const anyAvailable =
    data.localStatus?.ollama.available || data.localStatus?.lmstudio.available;
  const models = anyAvailable && discovered.length > 0 ? discovered : [];

  try {
    sessionStorage.setItem(LOCAL_MODELS_CACHE_KEY, JSON.stringify({ ts: Date.now(), models }));
  } catch {
    // sessionStorage full/unavailable — caching is best-effort
  }
  return models;
}

export function ModelSelector({ selectedModel, onModelChange, className = '' }: ModelSelectorProps) {
  const modelsByProvider = getModelsByProvider();
  const [localModels, setLocalModelsState] = useState<AIModel[]>([]);
  const [localChecked, setLocalChecked] = useState(false);

  // Probe for local models on mount
  useEffect(() => {
    const controller = new AbortController();
    probeLocalModels({ signal: controller.signal })
      .then((models) => {
        if (models.length > 0) {
          setLocalModelsState(models);
          setLocalModels(models);
        }
      })
      .catch(() => {
        // Local servers not available — silently ignore
      })
      .finally(() => setLocalChecked(true));
    return () => controller.abort();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const modelId = e.target.value;
    // Try the dynamic model list first, then fall back to static registry
    const dynamicModel = localModels.find((m) => m.id === modelId);
    const model = dynamicModel ?? getModelById(modelId);
    if (model) {
      onModelChange(modelId, model.provider);
    }
  };

  return (
    <div className={`relative ${className}`}>
      <select
        value={selectedModel}
        onChange={handleChange}
        aria-label="Select AI model"
        className="
          appearance-none bg-raised border border-edge-strong rounded-theme
          pl-3 pr-8 py-1.5 text-sm text-t1
          focus:outline-none focus:border-lucy-500 focus:ring-1 focus:ring-lucy-500
          cursor-pointer transition-colors hover:border-accent-soft/50
        "
      >
        {/* Primary providers (Claude, ChatGPT) — always selectable */}
        {PRIMARY_PROVIDERS.map((provider) => (
          <optgroup key={provider} label={PROVIDER_LABELS[provider]}>
            {(modelsByProvider[provider] ?? []).map((model) => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))}
          </optgroup>
        ))}

        {/* Local group — always shown so users know it exists */}
        <optgroup label={`Local${!localChecked ? ' (detecting...)' : ''}`}>
          {localModels.length > 0 ? (
            localModels.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))
          ) : (
            <option value="" disabled>
              {localChecked ? 'No local models found' : 'Detecting...'}
            </option>
          )}
        </optgroup>

        {/* Other providers — greyed out / unselectable until configured */}
        {SECONDARY_PROVIDERS.map((provider) => (
          <optgroup key={provider} label={`${PROVIDER_LABELS[provider]} (needs API key)`} disabled>
            {(modelsByProvider[provider] ?? []).map((model) => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none text-t3">
        <ChevronDown className="w-3.5 h-3.5" />
      </div>
      {localChecked && localModels.length === 0 && (
        <button
          type="button"
          onClick={() => {
            setLocalChecked(false);
            probeLocalModels({ force: true })
              .then((models) => {
                if (models.length > 0) {
                  setLocalModelsState(models);
                  setLocalModels(models);
                }
              })
              .catch(() => {})
              .finally(() => setLocalChecked(true));
          }}
          className="ml-1 p-1 rounded text-t3 hover:text-t2 transition-colors"
          title="Re-detect local models"
          aria-label="Re-detect local models"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
