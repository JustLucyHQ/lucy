import OpenAI from 'openai';

export interface EmbedderConfig {
  apiKey: string;
  model?: string;
  baseURL?: string; // e.g. Ollama: http://localhost:11434/v1
  /** Provider id from memory_settings. Most are OpenAI-compatible; 'cohere' uses its own API. */
  provider?: string;
}

const DEFAULT_COHERE_BASE = 'https://api.cohere.com/v2';

/** Cohere v2 /embed — not OpenAI-shaped (texts[] in, embeddings.float[][] out). */
async function cohereEmbedBatch(
  texts: string[],
  config: EmbedderConfig
): Promise<(number[] | null)[]> {
  if (!config.apiKey || texts.length === 0) return texts.map(() => null);
  try {
    const base = (config.baseURL || DEFAULT_COHERE_BASE).replace(/\/$/, '');
    const res = await fetch(`${base}/embed`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model ?? 'embed-english-v3.0',
        input_type: 'search_document', // generic; query/doc symmetry is a later refinement
        embedding_types: ['float'],
        texts,
      }),
    });
    if (!res.ok) return texts.map(() => null);
    const json = (await res.json()) as { embeddings?: { float?: number[][] } };
    const floats = json?.embeddings?.float;
    if (!floats) return texts.map(() => null);
    return texts.map((_, i) => floats[i] ?? null);
  } catch {
    return texts.map(() => null);
  }
}

/** OpenAI-compatible embeddings (OpenAI, Ollama, Google, Mistral, Jina, Voyage, …). */
async function openAiEmbedBatch(
  texts: string[],
  config: EmbedderConfig
): Promise<(number[] | null)[]> {
  if (texts.length === 0) return [];
  if (!config.apiKey && !config.baseURL) return texts.map(() => null);
  try {
    const client = new OpenAI({
      apiKey: config.apiKey || 'not-required',
      ...(config.baseURL ? { baseURL: config.baseURL } : {}),
    });
    const res = await client.embeddings.create({
      model: config.model ?? 'text-embedding-3-small',
      input: texts,
    });
    return texts.map((_, i) => res.data[i]?.embedding ?? null);
  } catch {
    return texts.map(() => null);
  }
}

/**
 * Embed a single string. Returns null when no embedder is configured or the provider
 * errors — callers treat null as "no vector available" and fall back to lexical search.
 */
export async function embedText(
  text: string,
  config: EmbedderConfig
): Promise<number[] | null> {
  const [v] = await embedBatch([text], config);
  return v ?? null;
}

/** Batch embed. Returns null entries when the provider is unavailable. */
export async function embedBatch(
  texts: string[],
  config: EmbedderConfig
): Promise<(number[] | null)[]> {
  if (config.provider === 'cohere') return cohereEmbedBatch(texts, config);
  return openAiEmbedBatch(texts, config);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
