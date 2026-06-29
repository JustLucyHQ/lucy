'use client';

import { useEffect, useState } from 'react';

interface MemorySettings {
  enabled: boolean;
  embedder_provider: string;
  embedder_model: string;
  embedder_base_url: string | null;
  embedder_dimensions: number;
  embedder_has_key?: boolean;
  contradiction_policy: 'supersede' | 'keep_history';
  deletion_grace_days: number;
}

interface Preset {
  provider: string;
  model: string;
  baseUrl: string;
  dims: number;
  needsKey: boolean;
}

// Presets fill provider + model + base URL + dimensions together. Anything with an
// OpenAI-compatible /v1/embeddings endpoint is a drop-in (base URL only); Cohere uses
// its own API via the adapter in lib/memory/embeddings.ts.
const EMBEDDER_PRESETS: Record<string, Preset> = {
  'OpenAI · 3-small (1536)': { provider: 'openai', model: 'text-embedding-3-small', baseUrl: '', dims: 1536, needsKey: true },
  'OpenAI · 3-large (3072)': { provider: 'openai', model: 'text-embedding-3-large', baseUrl: '', dims: 3072, needsKey: true },
  'Google · embedding-004 (768)': { provider: 'google', model: 'text-embedding-004', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', dims: 768, needsKey: true },
  'Mistral · mistral-embed (1024)': { provider: 'mistral', model: 'mistral-embed', baseUrl: 'https://api.mistral.ai/v1', dims: 1024, needsKey: true },
  'Jina · v3 (1024)': { provider: 'jina', model: 'jina-embeddings-v3', baseUrl: 'https://api.jina.ai/v1', dims: 1024, needsKey: true },
  'Voyage · voyage-3 (1024)': { provider: 'voyage', model: 'voyage-3', baseUrl: 'https://api.voyageai.com/v1', dims: 1024, needsKey: true },
  'Cohere · embed-v3 (1024)': { provider: 'cohere', model: 'embed-english-v3.0', baseUrl: 'https://api.cohere.com/v2', dims: 1024, needsKey: true },
  'Ollama · embeddinggemma (768)': { provider: 'ollama', model: 'embeddinggemma', baseUrl: 'http://localhost:11434/v1', dims: 768, needsKey: false },
  'Ollama · nomic-embed-text (768)': { provider: 'ollama', model: 'nomic-embed-text', baseUrl: 'http://localhost:11434/v1', dims: 768, needsKey: false },
  'Ollama · mxbai-embed-large (1024)': { provider: 'ollama', model: 'mxbai-embed-large', baseUrl: 'http://localhost:11434/v1', dims: 1024, needsKey: false },
  'Ollama · bge-m3 (1024)': { provider: 'ollama', model: 'bge-m3', baseUrl: 'http://localhost:11434/v1', dims: 1024, needsKey: false },
};

export function AdminMemoryPanel() {
  const [settings, setSettings] = useState<MemorySettings | null>(null);

  const [emb, setEmb] = useState({ provider: 'openai', model: '', baseUrl: '', dims: 1536, apiKey: '' });
  const [hasKey, setHasKey] = useState(false);
  const [embSaving, setEmbSaving] = useState(false);
  const [embMsg, setEmbMsg] = useState('');

  useEffect(() => {
    fetch('/api/memory/settings')
      .then((r) => r.json())
      .then((s: MemorySettings) => {
        setSettings(s);
        setHasKey(Boolean(s?.embedder_has_key));
        setEmb({
          provider: s?.embedder_provider ?? 'openai',
          model: s?.embedder_model ?? '',
          baseUrl: s?.embedder_base_url ?? '',
          dims: s?.embedder_dimensions ?? 1536,
          apiKey: '', // never loaded back — write-only
        });
      })
      .catch(() => {});
  }, []);

  async function update(patch: Partial<MemorySettings>) {
    setSettings((s) => (s ? { ...s, ...patch } : s));
    await fetch('/api/memory/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }).catch(() => {});
  }

  async function saveEmbedder() {
    setEmbSaving(true);
    setEmbMsg('');
    try {
      const body: Record<string, unknown> = {
        embedder_provider: emb.provider,
        embedder_model: emb.model,
        embedder_base_url: emb.baseUrl || null,
        embedder_dimensions: Number(emb.dims),
      };
      // Only send the key when the admin typed one (keeps the stored key untouched otherwise).
      if (emb.apiKey.trim()) body.embedder_api_key = emb.apiKey.trim();

      const res = await fetch('/api/memory/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.ok) {
        setEmbMsg('Saved. (Changing the dimension clears existing embeddings — they re-generate on next use.)');
        if (emb.apiKey.trim()) setHasKey(true);
        setEmb((s) => ({ ...s, apiKey: '' }));
        setSettings((s) =>
          s
            ? {
                ...s,
                embedder_provider: emb.provider,
                embedder_model: emb.model,
                embedder_base_url: emb.baseUrl || null,
                embedder_dimensions: Number(emb.dims),
              }
            : s
        );
      } else {
        setEmbMsg(`Error: ${json.error ?? 'failed to save'}`);
      }
    } catch (e) {
      setEmbMsg(`Error: ${e instanceof Error ? e.message : 'failed'}`);
    } finally {
      setEmbSaving(false);
    }
  }

  if (!settings) {
    return (
      <p className="text-xs text-gray-500 p-3 rounded-lg bg-gray-900 border border-gray-800">
        Memory settings unavailable (no connected backend).
      </p>
    );
  }

  // Local Ollama needs no key; every cloud provider does.
  const needsKey = emb.provider !== 'ollama';

  return (
    <div className="space-y-4 p-4 rounded-lg bg-gray-900 border border-gray-800">
      {/* ── Contradiction policy ─────────────────────────────────────────── */}
      <div className="text-sm">
        <div className="text-xs text-gray-500 mb-1">Contradiction policy</div>
        <select
          value={settings.contradiction_policy}
          onChange={(e) =>
            update({ contradiction_policy: e.target.value as MemorySettings['contradiction_policy'] })
          }
          className="bg-gray-950 border border-gray-800 rounded px-2 py-1 text-gray-200"
        >
          <option value="supersede">Supersede (keep current truth)</option>
          <option value="keep_history">Keep history (enterprise / audit)</option>
        </select>
      </div>

      {/* ── Deletion grace window ────────────────────────────────────────── */}
      <div className="text-sm">
        <div className="text-xs text-gray-500 mb-1">Deletion grace window (days)</div>
        <input
          type="number"
          min={0}
          value={settings.deletion_grace_days}
          onChange={(e) => update({ deletion_grace_days: Number(e.target.value) })}
          className="bg-gray-950 border border-gray-800 rounded px-2 py-1 w-24 text-gray-200"
        />
      </div>

      {/* ── Embedder ─────────────────────────────────────────────────────── */}
      <div className="text-sm border-t border-gray-800 pt-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium text-gray-300">Embedder · current: <span className="text-lucy-300">{emb.provider}/{emb.model || '—'}</span></div>
        </div>

        {/* Plain-language explainer */}
        <details className="rounded-lg bg-gray-950 border border-gray-800 px-3 py-2">
          <summary className="text-xs text-gray-400 cursor-pointer select-none">
            What is an embedder, and do I need one?
          </summary>
          <div className="mt-2 text-xs text-gray-400 space-y-1.5 leading-relaxed">
            <p>
              Memory has two jobs done by two different things. <strong className="text-gray-300">The chat
              model</strong> decides <em>what</em> is worth remembering and writes it down (e.g. &ldquo;User
              prefers dark mode&rdquo;). <strong className="text-gray-300">The embedder</strong> turns each saved
              note into a list of numbers that captures its <em>meaning</em> — a &ldquo;meaning fingerprint.&rdquo;
            </p>
            <p>
              Later, when you ask something, Lucy embeds your question and finds the saved notes whose
              fingerprints are closest in meaning — so <em>&ldquo;what are my UI settings?&rdquo;</em> still surfaces
              <em> &ldquo;prefers dark mode&rdquo;</em> even though they share no words.
            </p>
            <p>
              Think of the chat model as a librarian writing summary cards, and the embedder as the catalog
              that finds the right card by topic instead of flipping through every one.
            </p>
            <p className="text-gray-500">
              No embedder? Memory still works, but recall falls back to <strong>keyword</strong> matching
              (exact-ish words only). The embedder is what makes recall work by <strong>meaning</strong>.
              Pick a cloud provider (needs an API key) or a fully-local Ollama model (no key).
            </p>
          </div>
        </details>

        <div className="flex flex-wrap gap-1.5">
          {Object.entries(EMBEDDER_PRESETS).map(([label, p]) => (
            <button
              key={label}
              type="button"
              onClick={() => setEmb((s) => ({ ...s, provider: p.provider, model: p.model, baseUrl: p.baseUrl, dims: p.dims }))}
              className="text-xs px-2 py-1 rounded border border-gray-700 text-gray-300 hover:bg-gray-800"
            >
              {label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="text-xs text-gray-400">
            Model
            <input
              value={emb.model}
              onChange={(e) => setEmb((s) => ({ ...s, model: e.target.value }))}
              placeholder="embeddinggemma"
              className="mt-0.5 w-full bg-gray-950 border border-gray-800 rounded px-2 py-1 text-gray-200"
            />
          </label>
          <label className="text-xs text-gray-400">
            Dimensions
            <input
              type="number"
              min={1}
              value={emb.dims}
              onChange={(e) => setEmb((s) => ({ ...s, dims: Number(e.target.value) }))}
              className="mt-0.5 w-full bg-gray-950 border border-gray-800 rounded px-2 py-1 text-gray-200"
            />
          </label>
          <label className="text-xs text-gray-400 sm:col-span-2">
            Base URL (blank = OpenAI; Ollama = http://localhost:11434/v1)
            <input
              value={emb.baseUrl}
              onChange={(e) => setEmb((s) => ({ ...s, baseUrl: e.target.value }))}
              placeholder="http://localhost:11434/v1"
              className="mt-0.5 w-full bg-gray-950 border border-gray-800 rounded px-2 py-1 text-gray-200"
            />
          </label>
          {needsKey && (
            <label className="text-xs text-gray-400 sm:col-span-2">
              API key {hasKey && <span className="text-green-500">· a key is set</span>}
              <input
                type="password"
                value={emb.apiKey}
                onChange={(e) => setEmb((s) => ({ ...s, apiKey: e.target.value }))}
                placeholder={hasKey ? '•••••••• (leave blank to keep)' : 'cloud embedder API key'}
                className="mt-0.5 w-full bg-gray-950 border border-gray-800 rounded px-2 py-1 text-gray-200"
                autoComplete="off"
              />
            </label>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={embSaving || !emb.model}
            onClick={saveEmbedder}
            className="text-xs px-3 py-1 rounded bg-lucy-600 text-white hover:bg-lucy-500 disabled:opacity-50"
          >
            {embSaving ? 'Saving…' : 'Save embedder'}
          </button>
          {embMsg && <span className="text-xs text-gray-400">{embMsg}</span>}
        </div>
      </div>
    </div>
  );
}
