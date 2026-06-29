'use client';

import React, { useState } from 'react';
import { CheckCircle, Cpu, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { useSettingsStore } from '@/lib/store/settings';
import type { AIModel } from '@/lib/providers/types';

interface LocalStatus {
  ollama: { available: boolean; url: string; modelCount: number };
  lmstudio: { available: boolean; url: string; modelCount: number };
}

export function LocalModelsSection() {
  const { ollamaUrl, lmStudioUrl, setOllamaUrl, setLmStudioUrl } = useSettingsStore();
  const [detecting, setDetecting] = useState(false);
  const [status, setStatus] = useState<LocalStatus | null>(null);
  const [detectedModels, setDetectedModels] = useState<AIModel[]>([]);

  const handleDetect = async () => {
    setDetecting(true);
    try {
      // Pass custom URLs via search params so the API can use them
      const url = new URL('/api/models', window.location.origin);
      url.searchParams.set('includeLocal', 'true');

      const res = await fetch(url.toString());
      if (!res.ok) throw new Error('Failed to fetch models');

      const data = await res.json() as {
        byProvider: { local: AIModel[] };
        localStatus: LocalStatus;
      };

      setStatus(data.localStatus);
      setDetectedModels(data.byProvider.local ?? []);
    } catch {
      setStatus(null);
    } finally {
      setDetecting(false);
    }
  };

  return (
    <section>
      <h2 className="text-lg font-semibold text-white mb-4">Local Models</h2>
      <p className="text-xs text-gray-500 mb-4 p-3 rounded-lg bg-gray-900 border border-gray-800">
        Run AI models locally using{' '}
        <a href="https://ollama.com" target="_blank" rel="noopener noreferrer" className="text-lucy-400 hover:text-lucy-300">Ollama</a>
        {' '}or{' '}
        <a href="https://lmstudio.ai" target="_blank" rel="noopener noreferrer" className="text-lucy-400 hover:text-lucy-300">LM Studio</a>.
        {' '}No API key required. Models show in the model selector only when detected.
      </p>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Cpu className="w-5 h-5 text-lucy-400" />
                <div>
                  <CardTitle>Ollama</CardTitle>
                  <CardDescription>Local inference via Ollama</CardDescription>
                </div>
              </div>
              {status && (
                <Badge variant={status.ollama.available ? 'success' : 'default'}>
                  {status.ollama.available
                    ? `Connected (${status.ollama.modelCount} model${status.ollama.modelCount !== 1 ? 's' : ''})`
                    : 'Not running'}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <label className="block text-xs font-medium text-gray-400 mb-1">Server URL</label>
            <input
              type="url"
              value={ollamaUrl}
              onChange={(e) => setOllamaUrl(e.target.value)}
              placeholder="http://localhost:11434"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-lucy-500 focus:ring-1 focus:ring-lucy-500"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Cpu className="w-5 h-5 text-gray-400" />
                <div>
                  <CardTitle>LM Studio</CardTitle>
                  <CardDescription>Local inference via LM Studio</CardDescription>
                </div>
              </div>
              {status && (
                <Badge variant={status.lmstudio.available ? 'success' : 'default'}>
                  {status.lmstudio.available
                    ? `Connected (${status.lmstudio.modelCount} model${status.lmstudio.modelCount !== 1 ? 's' : ''})`
                    : 'Not running'}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <label className="block text-xs font-medium text-gray-400 mb-1">Server URL</label>
            <input
              type="url"
              value={lmStudioUrl}
              onChange={(e) => setLmStudioUrl(e.target.value)}
              placeholder="http://localhost:1234"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-lucy-500 focus:ring-1 focus:ring-lucy-500"
            />
          </CardContent>
        </Card>

        {/* Detect button + model list */}
        <div className="flex items-center gap-4">
          <Button
            variant="secondary"
            size="sm"
            icon={<RefreshCw className={`w-4 h-4 ${detecting ? 'animate-spin' : ''}`} />}
            onClick={handleDetect}
            disabled={detecting}
            loading={detecting}
          >
            {detecting ? 'Detecting...' : 'Detect Models'}
          </Button>
          {status && !status.ollama.available && !status.lmstudio.available && (
            <span className="text-xs text-gray-500">
              No local servers found. Start Ollama or LM Studio first.
            </span>
          )}
        </div>

        {detectedModels.length > 0 && (
          <div className="rounded-lg border border-gray-800 bg-gray-900 divide-y divide-gray-800">
            {detectedModels.map((model) => (
              <div key={model.id} className="flex items-center gap-3 px-4 py-2.5">
                <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-100 truncate">{model.name}</p>
                  <p className="text-xs text-gray-500 truncate">{model.id}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
