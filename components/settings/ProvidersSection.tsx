'use client';

import React, { useState } from 'react';
import { Eye, EyeOff, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { useSettingsStore } from '@/lib/store/settings';
import { useStorage, useStorageMode } from '@/lib/storage/provider';
import type { ProviderName } from '@/lib/providers/types';

/** Cloud providers that require API keys. */
type CloudProvider =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'deepseek'
  | 'groq'
  | 'mistral'
  | 'xai'
  | 'openrouter';

const PROVIDERS: {
  key: CloudProvider;
  name: string;
  placeholder: string;
  docsUrl: string;
  models: string[];
}[] = [
  {
    key: 'openai',
    name: 'OpenAI',
    placeholder: 'sk-...',
    docsUrl: 'https://platform.openai.com/api-keys',
    models: ['GPT-4o', 'GPT-4o Mini', 'GPT-3.5 Turbo'],
  },
  {
    key: 'anthropic',
    name: 'Anthropic',
    placeholder: 'sk-ant-...',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    models: ['Claude Sonnet 4', 'Claude Haiku 4'],
  },
  {
    key: 'google',
    name: 'Google AI',
    placeholder: 'AIza...',
    docsUrl: 'https://aistudio.google.com/app/apikey',
    models: ['Gemini 2.0 Flash', 'Gemini 1.5 Pro'],
  },
  {
    key: 'deepseek',
    name: 'DeepSeek',
    placeholder: 'sk-...',
    docsUrl: 'https://platform.deepseek.com/api_keys',
    models: ['DeepSeek V3 (Chat)', 'DeepSeek R1 (Reasoner)'],
  },
  {
    key: 'groq',
    name: 'Groq',
    placeholder: 'gsk_...',
    docsUrl: 'https://console.groq.com/keys',
    models: ['Llama 3.3 70B', 'Llama 3.1 8B Instant', 'Gemma 2 9B'],
  },
  {
    key: 'mistral',
    name: 'Mistral',
    placeholder: '...',
    docsUrl: 'https://console.mistral.ai/api-keys',
    models: ['Mistral Large', 'Mistral Small'],
  },
  {
    key: 'xai',
    name: 'xAI (Grok)',
    placeholder: 'xai-...',
    docsUrl: 'https://console.x.ai',
    models: ['Grok 2', 'Grok Beta'],
  },
  {
    key: 'openrouter',
    name: 'OpenRouter',
    placeholder: 'sk-or-...',
    docsUrl: 'https://openrouter.ai/keys',
    models: ['Auto', 'Claude 3.5 Sonnet', 'Llama 3.3 70B'],
  },
];

type TestStatus = 'idle' | 'testing' | 'success' | 'error';

interface ApiKeyCardProps {
  providerKey: CloudProvider;
  name: string;
  placeholder: string;
  docsUrl: string;
  models: string[];
}

function ApiKeyCard({ providerKey, name, placeholder, docsUrl, models }: ApiKeyCardProps) {
  const { apiKeys, setApiKey } = useSettingsStore();
  const adapter = useStorage();
  const [showKey, setShowKey] = useState(false);
  const [testStatus, setTestStatus] = useState<TestStatus>('idle');
  const [localValue, setLocalValue] = useState<string | null>(null);

  // Use local edit state while typing; otherwise show persisted value
  // providerKey is always a cloud provider key (openai | anthropic | google)
  const value = localValue ?? (apiKeys as unknown as Record<string, string>)[providerKey];

  const handleChange = (newValue: string) => {
    setLocalValue(newValue);
  };

  const handleBlur = async () => {
    if (localValue !== null) {
      await setApiKey(providerKey, localValue, adapter);
      setLocalValue(null);
    }
  };

  const handleTest = async () => {
    if (!value) return;
    setTestStatus('testing');

    try {
      const headerKeyMap: Record<string, string> = {
        openai: 'x-openai-key',
        anthropic: 'x-anthropic-key',
        google: 'x-google-key',
        deepseek: 'x-deepseek-key',
        groq: 'x-groq-key',
        mistral: 'x-mistral-key',
        xai: 'x-xai-key',
        openrouter: 'x-openrouter-key',
      };
      const headerKey = headerKeyMap[providerKey];

      const testModelMap: Record<CloudProvider, string> = {
        openai: 'gpt-4o-mini',
        anthropic: 'claude-haiku-4-5',
        google: 'gemini-2.0-flash',
        deepseek: 'deepseek-chat',
        groq: 'llama-3.1-8b-instant',
        mistral: 'mistral-small-latest',
        xai: 'grok-beta',
        openrouter: 'openrouter/auto',
      };

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(headerKey ? { [headerKey]: value } : {}),
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Say "ok" and nothing else.' }],
          model: testModelMap[providerKey],
          provider: providerKey,
        }),
      });

      if (response.ok) {
        // Read a bit of the stream to verify it works
        const reader = response.body?.getReader();
        if (reader) {
          await reader.read();
          reader.cancel();
          setTestStatus('success');
        } else {
          setTestStatus('error');
        }
      } else {
        setTestStatus('error');
      }
    } catch {
      setTestStatus('error');
    }

    setTimeout(() => setTestStatus('idle'), 3000);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{name}</CardTitle>
            <CardDescription>
              Available models: {models.join(', ')}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {value ? (
              <Badge variant="success">Configured</Badge>
            ) : (
              <Badge variant="default">Not set</Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={value}
              onChange={(e) => handleChange(e.target.value)}
              onBlur={handleBlur}
              placeholder={placeholder}
              autoComplete="off"
              className="
                w-full bg-gray-900 border border-gray-700 rounded-lg
                px-3 py-2 pr-9 text-sm text-gray-100 placeholder-gray-600
                focus:outline-none focus:border-lucy-500 focus:ring-1 focus:ring-lucy-500
              "
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
            >
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          <div className="flex items-center justify-between">
            <a
              href={docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-lucy-400 hover:text-lucy-300"
            >
              Get your API key
            </a>

            <div className="flex items-center gap-2">
              {testStatus === 'success' && (
                <span className="flex items-center gap-1 text-xs text-green-400">
                  <CheckCircle className="w-3.5 h-3.5" />
                  Connection successful
                </span>
              )}
              {testStatus === 'error' && (
                <span className="flex items-center gap-1 text-xs text-red-400">
                  <XCircle className="w-3.5 h-3.5" />
                  Connection failed
                </span>
              )}
              <Button
                variant="secondary"
                size="sm"
                onClick={handleTest}
                disabled={!value || testStatus === 'testing'}
                loading={testStatus === 'testing'}
              >
                Test Connection
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function ProvidersSection() {
  const storageMode = useStorageMode();

  return (
    <section>
      <h2 className="text-lg font-semibold text-white mb-4">AI Providers</h2>
      <p className="text-xs text-gray-500 mb-4 p-3 rounded-lg bg-gray-900 border border-gray-800">
        {storageMode === 'supabase'
          ? 'API keys are stored in Supabase with obfuscation and sent directly to each provider. They are never logged.'
          : "API keys are stored locally in your browser's localStorage and sent directly to each provider. They are never stored on our servers."}
        {' '}For production use, consider using environment variables instead.
      </p>
      <div className="space-y-4">
        {PROVIDERS.map((p) => (
          <ApiKeyCard key={p.key} providerKey={p.key} name={p.name} placeholder={p.placeholder} docsUrl={p.docsUrl} models={p.models} />
        ))}
      </div>
    </section>
  );
}
