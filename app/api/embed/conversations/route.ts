// GET /api/embed/conversations?widgetId=<id>  → owner's list for that widget
// GET /api/embed/conversations?id=<convId>     → full transcript (owner-scoped)
import { NextRequest } from 'next/server';
import { resolveMemoryAuth } from '@/lib/memory/auth';
import { listConversations, getTranscript } from '@/lib/embed/conversations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { userId } = await resolveMemoryAuth(req);
  if (!userId) return Response.json({ ok: false }, { status: 401 });

  const id = req.nextUrl.searchParams.get('id');
  if (id) {
    const transcript = await getTranscript(userId, id);
    if (!transcript) return Response.json({ ok: false, error: 'not found' }, { status: 404 });
    return Response.json({ ok: true, transcript });
  }

  const widgetId = req.nextUrl.searchParams.get('widgetId');
  if (!widgetId) return Response.json({ ok: false, error: 'widgetId or id required' }, { status: 400 });
  return Response.json({ ok: true, conversations: await listConversations(userId, widgetId) });
}
