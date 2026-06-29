// /api/oauth/connections — list the current user's OAuth connections and which
// providers have an app configured (so the UI can show Connect vs. coming-soon);
// DELETE disconnects a provider.
import { NextRequest, NextResponse } from 'next/server';
import { resolveMemoryAuth } from '@/lib/memory/auth';
import { listConnections, deleteConnection } from '@/lib/oauth/connections';
import { configuredProviders } from '@/lib/oauth/providers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { userId } = await resolveMemoryAuth(req);
  if (!userId) return NextResponse.json({ connections: [], configured: configuredProviders() });
  const connections = await listConnections(userId);
  return NextResponse.json({ connections, configured: configuredProviders() });
}

export async function DELETE(req: NextRequest) {
  const { userId } = await resolveMemoryAuth(req);
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const provider = new URL(req.url).searchParams.get('provider');
  if (!provider) return NextResponse.json({ error: 'missing provider' }, { status: 400 });
  await deleteConnection(userId, provider);
  return NextResponse.json({ ok: true });
}
