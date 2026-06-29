import { NextRequest } from 'next/server';
import type { ChatMessage, ProviderName } from '@/lib/providers/types';
import { getProvider } from '@/lib/providers';
import { extractMemories } from '@/lib/memory/extractor';
import type { MemoryRecord } from '@/lib/memory/types';
import { checkRateLimit, getClientIp } from '@/lib/api/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TIMEOUT_MS = 30_000;
const RATE_LIMIT_MAX = 15; // per IP per minute (lower than chat — each call runs an LLM pass)
const EMPTY = { memories: [], entities: [], profilePatch: {} };

/**
 * Stateless extraction for STANDALONE mode. Runs the LLM extraction with the
 * user's own provider/key and returns the result WITHOUT persisting anything —
 * the client stores it in IndexedDB. No Supabase or auth involved.
 */
export async function POST(req: NextRequest) {
  try {
    const { limited, retryAfterSeconds } = checkRateLimit('extract-local', getClientIp(req), RATE_LIMIT_MAX);
    if (limited) {
      return Response.json(
        { result: EMPTY, error: 'rate limited' },
        { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }
      );
    }

    const { messages, model, provider, apiKey, existing, incognito } = (await req.json()) as {
      messages: ChatMessage[];
      model: string;
      provider: ProviderName;
      apiKey: string;
      existing?: MemoryRecord[];
      incognito?: boolean;
    };

    if (incognito || !messages?.length) {
      return Response.json({ result: EMPTY });
    }

    if (!apiKey || !apiKey.trim()) {
      return Response.json({ result: EMPTY, error: 'API key required for memory extraction' });
    }

    const llm = async (prompt: string): Promise<string> => {
      let out = '';
      await Promise.race([
        getProvider(provider).chat([{ role: 'user', content: prompt }], model, (c) => {
          out += c;
        }, { apiKey }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('LLM extraction timeout')), TIMEOUT_MS)
        ),
      ]);
      return out;
    };

    const result = await extractMemories(messages, existing ?? [], llm);
    return Response.json({ result });
  } catch (e) {
    return Response.json({ result: EMPTY, error: String(e) });
  }
}
