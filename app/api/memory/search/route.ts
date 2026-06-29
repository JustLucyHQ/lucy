import type { NextRequest } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/api/rate-limit';

export const runtime = 'nodejs';

// Each call runs an embedding pass — keep the per-IP ceiling modest.
const RATE_LIMIT_MAX = 30;

/**
 * POST /api/memory/search — semantic search over the caller's memories.
 *
 * Used by the workflow Knowledge Base node (and any client that needs raw
 * recall results). Auth is derived from the session/API key via
 * resolveMemoryAuth — the request body's user identity is never trusted.
 * The embedder is built the same way as chat's retrieval path: admin-set
 * embedder config from `memory_settings` wins, else the OpenAI key.
 */
export async function POST(req: NextRequest) {
  const { limited, retryAfterSeconds } = checkRateLimit('memory-search', getClientIp(req), RATE_LIMIT_MAX);
  if (limited) {
    return Response.json(
      { error: 'rate limited' },
      { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }
    );
  }

  let body: { query?: unknown; limit?: unknown; projectId?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const query = typeof body.query === 'string' ? body.query.trim() : '';
  if (!query) {
    return Response.json({ error: 'Missing required field: query' }, { status: 400 });
  }
  const limit = Math.min(Math.max(Number(body.limit) || 5, 1), 25);
  const projectId = typeof body.projectId === 'string' ? body.projectId : null;

  try {
    const { resolveMemoryAuth } = await import('@/lib/memory/auth');
    const { userId, client } = await resolveMemoryAuth(req);
    if (!userId || !client) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { SupabaseMemoryStore } = await import('@/lib/memory/supabase-store');
    const { data: cfg } = await client
      .from('memory_settings')
      .select('embedder_provider, embedder_model, embedder_base_url, embedder_api_key')
      .eq('id', 1)
      .maybeSingle();

    const embedderKey = req.headers.get('x-openai-key') || process.env.OPENAI_API_KEY || '';
    const store = new SupabaseMemoryStore(client, {
      apiKey: (cfg?.embedder_api_key as string) || embedderKey,
      model: (cfg?.embedder_model as string) || undefined,
      baseURL: (cfg?.embedder_base_url as string) || undefined,
      provider: (cfg?.embedder_provider as string) || undefined,
    });

    const records = await store.search({ userId, projectId }, query, { limit });
    return Response.json({
      results: records.map((r) => ({ content: r.content, importance: r.importance })),
      count: records.length,
    });
  } catch (err) {
    // Log details server-side; return a generic message to the client.
    console.error('[memory/search]', err instanceof Error ? err.message : String(err));
    return Response.json({ error: 'search failed' }, { status: 500 });
  }
}
