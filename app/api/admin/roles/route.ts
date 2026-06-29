import { NextRequest, NextResponse } from 'next/server';
import { resolveMemoryAuth } from '@/lib/memory/auth';
import {
  getServiceClient,
  isAdminUser,
  listUsersWithRoles,
  roleOf,
  setUserRole,
} from '@/lib/auth/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Admin-only user role management (admin flag in auth app_metadata). */

export async function GET(req: NextRequest) {
  const { userId } = await resolveMemoryAuth(req);
  if (!userId || !(await isAdminUser(userId))) {
    return NextResponse.json({ error: 'admin only' }, { status: 403 });
  }
  const client = getServiceClient();
  if (!client) return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });

  const users = await listUsersWithRoles(client);
  return NextResponse.json({
    users: users
      .map((u) => ({
        id: u.id,
        email: u.email ?? '',
        role: roleOf(u),
        created_at: u.created_at ?? null,
      }))
      .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? '')),
  });
}

export async function POST(req: NextRequest) {
  const { userId } = await resolveMemoryAuth(req);
  if (!userId || !(await isAdminUser(userId))) {
    return NextResponse.json({ error: 'admin only' }, { status: 403 });
  }
  const client = getServiceClient();
  if (!client) return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });

  const body = await req.json().catch(() => null);
  const targetId = typeof body?.userId === 'string' ? body.userId : '';
  const role = body?.role === 'admin' ? 'admin' : body?.role === 'member' ? 'member' : null;
  if (!targetId || !role) {
    return NextResponse.json({ error: 'userId and role (admin|member) required' }, { status: 400 });
  }

  // Lockout guard: never demote the last remaining admin
  if (role === 'member') {
    const users = await listUsersWithRoles(client);
    const admins = users.filter((u) => roleOf(u) === 'admin');
    if (admins.length <= 1 && admins.some((u) => u.id === targetId)) {
      return NextResponse.json({ error: 'cannot remove the last admin' }, { status: 400 });
    }
  }

  const ok = await setUserRole(client, targetId, role);
  if (!ok) return NextResponse.json({ error: 'update failed' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
