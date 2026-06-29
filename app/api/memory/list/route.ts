import { NextRequest } from 'next/server';
import { SupabaseMemoryStore } from '@/lib/memory/supabase-store';
import { resolveMemoryAuth } from '@/lib/memory/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { userId, client } = await resolveMemoryAuth(req);
  if (!userId || !client) {
    return Response.json(
      { memories: [], usage: { memories: 0, entities: 0, bytes: 0 } },
      { status: 401 }
    );
  }
  const store = new SupabaseMemoryStore(client, { apiKey: '' });
  const scope = { userId, projectId: null };
  const [memories, usage] = await Promise.all([store.listAll(scope), store.usage(scope)]);
  return Response.json({ memories, usage });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  const { userId, client } = await resolveMemoryAuth(req);
  if (!userId || !client) return Response.json({ ok: false }, { status: 401 });
  if (!id) return Response.json({ ok: false, error: 'missing id' }, { status: 400 });
  // Defense in depth: confirm the memory belongs to the caller before archiving.
  // The cookie client is RLS-scoped, but the API-key path uses a service client
  // (RLS-bypassing), so verify ownership explicitly to prevent an IDOR.
  const { data: owned } = await client
    .from('memories')
    .select('id')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();
  if (!owned) return Response.json({ ok: false, error: 'not found' }, { status: 404 });
  const store = new SupabaseMemoryStore(client, { apiKey: '' });
  await store.archive(id);
  return Response.json({ ok: true });
}
