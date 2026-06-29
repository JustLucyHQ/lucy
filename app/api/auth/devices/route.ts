import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resolveMemoryAuth } from '@/lib/memory/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { userId, client } = await resolveMemoryAuth(req);
  if (!userId || !client) return Response.json({ devices: [] }, { status: 200 });
  const { data } = await client.from('member_devices').select('*').eq('user_id', userId).order('last_active_at', { ascending: false });
  return Response.json({ devices: data ?? [] });
}

export async function DELETE(req: NextRequest) {
  const { userId } = await resolveMemoryAuth(req);
  if (!userId) return Response.json({ ok: false }, { status: 401 });
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return Response.json({ ok: false }, { status: 400 });

  const url = (process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !svcKey) return Response.json({ ok: false }, { status: 500 });
  const svc = createClient(url, svcKey, { db: { schema: 'lucy' } });

  await svc.from('member_devices').delete().eq('id', id).eq('user_id', userId); // ownership-scoped
  return Response.json({ ok: true });
}
