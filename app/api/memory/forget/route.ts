import { NextRequest } from 'next/server';
import { SupabaseMemoryStore } from '@/lib/memory/supabase-store';
import { resolveMemoryAuth } from '@/lib/memory/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Forget (archive) the caller's memories whose content/summary matches the text. */
export async function POST(req: NextRequest) {
  try {
    const { text } = (await req.json()) as { text?: string };
    if (!text || !text.trim()) {
      return Response.json({ ok: false, error: 'missing text' }, { status: 400 });
    }
    // userId derived from the session — never trusted from the body.
    const { userId, client } = await resolveMemoryAuth(req);
    if (!userId || !client) return Response.json({ ok: false }, { status: 401 });

    const store = new SupabaseMemoryStore(client, { apiKey: '' });
    const scope = { userId, projectId: null };
    const needle = text.trim().toLowerCase();
    // listAll is already scoped to the user, so every match is the caller's own row.
    const matches = (await store.listAll(scope)).filter((m) =>
      `${m.content} ${m.summary ?? ''}`.toLowerCase().includes(needle)
    );
    for (const m of matches) await store.archive(m.id);
    return Response.json({ ok: true, forgotten: matches.length });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
