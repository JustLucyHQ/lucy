// GET /api/embed/config?w=<id> — PUBLIC appearance config for a widget.
// Returns only safe, non-sensitive fields (never persona/faq/owner/key).
import { NextRequest } from 'next/server';
import { getWidget } from '@/lib/embed/widgets';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CORS = { 'Access-Control-Allow-Origin': '*' };

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('w');
  if (!id) return Response.json({ ok: false }, { status: 400, headers: CORS });
  const w = await getWidget(id);
  if (!w) return Response.json({ ok: false }, { status: 404, headers: CORS });
  return Response.json(
    {
      ok: true,
      widget: {
        id: w.id,
        name: w.name,
        greeting: w.greeting,
        launcher_label: w.launcher_label,
        position: w.position,
        theme: w.theme,
        accent: w.accent,
        // Only surface starter questions when the owner has the option enabled.
        suggested_questions: w.show_questions ? (w.suggested_questions ?? []) : [],
      },
    },
    { headers: CORS },
  );
}
