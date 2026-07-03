import { NextRequest } from 'next/server';
import type { ChatMessage, ProviderName } from '@/lib/providers/types';
import { getProvider } from '@/lib/providers';
import { extractMemories } from '@/lib/memory/extractor';
import { ingestExtraction } from '@/lib/memory';
import { SupabaseMemoryStore } from '@/lib/memory/supabase-store';
import { resolveMemoryAuth } from '@/lib/memory/auth';
import { decryptSecretMaybe } from '@/lib/mcp/secret';
import { checkRateLimit, getClientIp } from '@/lib/api/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EXTRACTION_TIMEOUT_MS = 30_000;
const RATE_LIMIT_MAX = 15; // per IP per minute (matches extract-local — each call runs an LLM pass)

export async function POST(req: NextRequest) {
  try {
    const { limited, retryAfterSeconds } = checkRateLimit('extract', getClientIp(req), RATE_LIMIT_MAX);
    if (limited) {
      return Response.json(
        { ok: false, error: 'rate limited' },
        { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }
      );
    }

    const { messages, projectId, conversationId, model, provider, apiKey, embedderKey, incognito } =
      (await req.json()) as {
        messages: ChatMessage[];
        projectId?: string;
        conversationId?: string;
        model: string;
        provider: ProviderName;
        apiKey: string;
        embedderKey?: string;
        incognito?: boolean;
      };

    if (incognito || !messages?.length) {
      return Response.json({ ok: true, skipped: true });
    }

    // userId is derived from the session — NEVER trusted from the body.
    const { userId, client } = await resolveMemoryAuth(req);
    if (!userId || !client) {
      return Response.json({ ok: true, skipped: true });
    }

    // Resolve the admin embedder config (provider + model + base URL + key).
    const { data: cfg } = await client
      .from('memory_settings')
      .select('embedder_provider, embedder_model, embedder_base_url, embedder_api_key, contradiction_policy')
      .eq('id', 1)
      .maybeSingle();

    const store = new SupabaseMemoryStore(client, {
      // admin-set embedder key wins; else the request/env OpenAI key.
      apiKey: decryptSecretMaybe(cfg?.embedder_api_key as string | undefined) || embedderKey || process.env.OPENAI_API_KEY || '',
      model: (cfg?.embedder_model as string) || undefined,
      baseURL: (cfg?.embedder_base_url as string) || undefined,
      provider: (cfg?.embedder_provider as string) || undefined,
    });
    const scope = { userId, projectId: projectId ?? null };

    // LLM caller using the same provider/model as the chat, bounded by a timeout
    // so a hung provider can't block the route indefinitely.
    const llm = async (prompt: string): Promise<string> => {
      let out = '';
      await Promise.race([
        getProvider(provider).chat([{ role: 'user', content: prompt }], model, (c) => {
          out += c;
        }, { apiKey }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('LLM extraction timeout')), EXTRACTION_TIMEOUT_MS)
        ),
      ]);
      return out;
    };

    const policy: 'supersede' | 'keep_history' =
      cfg?.contradiction_policy === 'keep_history' ? 'keep_history' : 'supersede';

    const existing = await store.search(scope, messages.map((m) => m.content).join(' '), { limit: 10 });
    const result = await extractMemories(messages, existing, llm);
    await ingestExtraction(store, scope, result, conversationId ?? null, policy);

    return Response.json({ ok: true, stored: result.memories.length });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
