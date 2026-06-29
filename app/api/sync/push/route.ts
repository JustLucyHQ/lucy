import { NextRequest, NextResponse } from 'next/server';
import { resolveMemoryAuth } from '@/lib/memory/auth';
import { encryptProviderKey } from '@/lib/auth/provider-keys';
import type { SyncBundle } from '@/lib/sync/bundle';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Local → cloud sync push.
 *
 * Called cross-origin by the desktop app (a 127.0.0.1 origin) with a Lucy API
 * key (`lucy_k_…`) in the Authorization header — the same auth the CLI uses.
 * Upserts the bundle into the key owner's cloud account. Idempotent: re-pushing
 * updates in place via the local `client_id`, so chats never duplicate.
 */

// Defensive caps so a malformed/huge bundle can't exhaust the server.
const MAX_CONVERSATIONS = 5000;
const MAX_MESSAGES_PER_CONVERSATION = 5000;
const MAX_CONTENT_LEN = 200_000;

// CORS: the caller is a non-credentialed Bearer-token request from a localhost
// origin, so `*` is safe (no cookies are read on this path).
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Max-Age': '86400',
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  // Auth: cookie session OR Lucy API key. Key callers get the service client,
  // scoped to userId by the writes below. userId is never trusted from the body.
  const { userId, client } = await resolveMemoryAuth(req);
  if (!userId || !client) return json({ ok: false, error: 'Unauthorized' }, 401);

  const bundle = (await req.json().catch(() => null)) as SyncBundle | null;
  if (!bundle || !Array.isArray(bundle.conversations)) {
    return json({ ok: false, error: 'Invalid bundle' }, 400);
  }
  if (bundle.conversations.length > MAX_CONVERSATIONS) {
    return json({ ok: false, error: 'Too many conversations' }, 413);
  }

  let conversationCount = 0;
  let messageCount = 0;

  // ── Conversations ──────────────────────────────────────────────────────────
  const convRows = bundle.conversations
    .filter((c) => c && typeof c.id === 'string')
    .map((c) => ({
      user_id: userId,
      client_id: c.id,
      title: typeof c.title === 'string' ? c.title.slice(0, 500) : 'Conversation',
      model: typeof c.model === 'string' ? c.model : 'gpt-4o',
      provider: typeof c.provider === 'string' ? c.provider : 'openai',
      created_at: new Date(c.createdAt || Date.now()).toISOString(),
      updated_at: new Date(c.updatedAt || Date.now()).toISOString(),
    }));

  // Map local conversation id → cloud uuid so messages can be remapped.
  const idMap = new Map<string, string>();

  if (convRows.length > 0) {
    const { data, error } = await client
      .from('conversations')
      .upsert(convRows, { onConflict: 'user_id,client_id' })
      .select('id, client_id');
    if (error) return json({ ok: false, error: error.message }, 500);
    for (const row of data ?? []) {
      idMap.set(row.client_id as string, row.id as string);
    }
    conversationCount = idMap.size;

    // ── Messages ───────────────────────────────────────────────────────────
    const msgRows: Record<string, unknown>[] = [];
    for (const c of bundle.conversations) {
      const cloudConvId = idMap.get(c.id);
      if (!cloudConvId || !Array.isArray(c.messages)) continue;
      const msgs = c.messages.slice(0, MAX_MESSAGES_PER_CONVERSATION);
      for (const m of msgs) {
        if (!m || typeof m.id !== 'string') continue;
        msgRows.push({
          conversation_id: cloudConvId,
          client_id: m.id,
          role: m.role === 'assistant' || m.role === 'system' ? m.role : 'user',
          content: typeof m.content === 'string' ? m.content.slice(0, MAX_CONTENT_LEN) : '',
          model: m.model ?? null,
          provider: m.provider ?? null,
          tokens_used: typeof m.tokensUsed === 'number' ? m.tokensUsed : null,
          created_at: new Date(m.createdAt || Date.now()).toISOString(),
        });
      }
    }

    if (msgRows.length > 0) {
      const { error: msgErr } = await client
        .from('messages')
        .upsert(msgRows, { onConflict: 'conversation_id,client_id' });
      if (msgErr) return json({ ok: false, error: msgErr.message }, 500);
      messageCount = msgRows.length;
    }
  }

  // ── Preferences ──────────────────────────────────────────────────────────────
  const prefs = bundle.preferences;
  if (prefs && typeof prefs === 'object') {
    const patch: Record<string, unknown> = {
      user_id: userId,
      updated_at: new Date().toISOString(),
    };
    if (typeof prefs.theme === 'string') patch.theme = prefs.theme;
    if (typeof prefs.defaultModel === 'string') patch.default_model = prefs.defaultModel;
    if (typeof prefs.defaultProvider === 'string') patch.default_provider = prefs.defaultProvider;
    if (typeof prefs.companyName === 'string') patch.company_name = prefs.companyName;
    await client.from('user_preferences').upsert(patch, { onConflict: 'user_id' });
  }

  // ── Provider keys (opt-in) ─────────────────────────────────────────────────
  let providerKeyCount = 0;
  if (Array.isArray(bundle.providerKeys) && bundle.providerKeys.length > 0) {
    const rows = bundle.providerKeys
      .filter((k) => k && typeof k.provider === 'string' && typeof k.apiKey === 'string' && k.apiKey)
      .slice(0, 50)
      .map((k) => ({
        user_id: userId,
        provider: k.provider.slice(0, 40),
        api_key_encrypted: encryptProviderKey(k.apiKey),
        is_active: true,
        updated_at: new Date().toISOString(),
      }));
    if (rows.length > 0) {
      const { error } = await client
        .from('provider_configs')
        .upsert(rows, { onConflict: 'user_id,provider' });
      if (!error) providerKeyCount = rows.length;
    }
  }

  return json({
    ok: true,
    conversations: conversationCount,
    messages: messageCount,
    providerKeys: providerKeyCount,
  });
}
