import { NextRequest } from 'next/server';
import { ingestCommand } from '@/lib/memory';
import { SupabaseMemoryStore } from '@/lib/memory/supabase-store';
import { resolveMemoryAuth } from '@/lib/memory/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { kind, text, projectId, conversationId } = (await req.json()) as {
      kind: 'remember' | 'global';
      text: string;
      projectId?: string;
      conversationId?: string;
    };
    if ((kind !== 'remember' && kind !== 'global') || !text || !text.trim()) {
      return Response.json({ ok: false, error: 'invalid command' }, { status: 400 });
    }
    // userId is derived from the session — NEVER trusted from the body.
    const { userId, client } = await resolveMemoryAuth(req);
    if (!userId || !client) return Response.json({ ok: false }, { status: 401 });
    const store = new SupabaseMemoryStore(client, { apiKey: '' });
    await ingestCommand(store, { userId, projectId: projectId ?? null }, kind, text, conversationId ?? null);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
