import { NextRequest } from 'next/server';
import { resolveMemoryAuth } from '@/lib/memory/auth';
import { isAdminUser } from '@/lib/auth/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { userId } = await resolveMemoryAuth(req);
  if (!userId) return Response.json({ isAdmin: false }, { status: 200 });
  return Response.json({ isAdmin: await isAdminUser(userId) });
}
