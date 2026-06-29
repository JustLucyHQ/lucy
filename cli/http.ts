/** HTTP helpers: authenticated requests + SSE stream parsing for /api/chat. */
import { loadConfig, fail } from './config';

export function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const { apiKey } = loadConfig();
  return {
    'Content-Type': 'application/json',
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    ...extra,
  };
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const { url } = loadConfig();
  let res: Response;
  try {
    res = await fetch(`${url}${path}`, { ...init, headers: { ...authHeaders(), ...init?.headers } });
  } catch {
    fail(`Cannot reach ${url} — is Lucy running? (set the URL with: lucy login)`);
  }
  if (res.status === 401) fail('Unauthorized — run `lucy login` with a valid Lucy API key (Settings → API Access).');
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    fail(`${path} → HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ''}`);
  }
  return (await res.json()) as T;
}

/** Like api(), but returns null on any error instead of exiting — for optional lookups. */
export async function apiSafe<T>(path: string, init?: RequestInit): Promise<T | null> {
  const { url } = loadConfig();
  try {
    const res = await fetch(`${url}${path}`, { ...init, headers: { ...authHeaders(), ...init?.headers } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * Stream a chat completion. Emits content chunks via onChunk; resolves with
 * the full reply. Mirrors lib/utils/stream.ts parsing (data: {...}\n\n, [DONE]).
 */
export async function streamChat(
  messages: ChatMessage[],
  model: string,
  provider: string,
  onChunk: (text: string) => void
): Promise<string> {
  const { url } = loadConfig();
  const res = await fetch(`${url}/api/chat`, {
    method: 'POST',
    headers: authHeaders({ 'x-memory-enabled': '1' }),
    body: JSON.stringify({ messages, model, provider }),
  }).catch(() => fail(`Cannot reach ${url} — is Lucy running?`));

  if (!res.ok || !res.body) fail(`/api/chat → HTTP ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';
    for (const event of events) {
      const line = event.trim();
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6);
      if (payload === '[DONE]') return full;
      try {
        const parsed = JSON.parse(payload) as { content?: string; error?: string };
        if (parsed.error) fail(parsed.error);
        if (parsed.content) {
          full += parsed.content;
          onChunk(parsed.content);
        }
        // metadata events (tool calls, memory counts) are ignored in v1
      } catch {
        /* partial frame — ignored */
      }
    }
  }
  return full;
}
