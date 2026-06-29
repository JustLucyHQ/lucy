// app/api/workflows/[id]/versions/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { resolveMemoryAuth } from '@/lib/memory/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface DefNode { data?: { nodeType?: string } }

// GET — list published versions (newest first), each with its definition snapshot.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId, client } = await resolveMemoryAuth(req);
  if (!userId || !client) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const { data, error } = await client
    .from('workflow_versions')
    .select('id, version, name, definition, published_at')
    .eq('user_id', userId)
    .eq('workflow_id', id)
    .order('version', { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ versions: data ?? [] });
}

// POST — publish the current draft as the next numbered version.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId, client } = await resolveMemoryAuth(req);
  if (!userId || !client) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const body = (await req.json().catch(() => null)) as { name?: string; definition?: { name?: string; nodes?: unknown; edges?: unknown } } | null;
  const def = body?.definition;
  if (!def || !Array.isArray(def.nodes) || !(def.nodes as DefNode[]).some((n) => n?.data?.nodeType === 'start')) {
    return NextResponse.json({ error: 'A publishable workflow needs a Start node' }, { status: 400 });
  }

  // Next version number for this (user, workflow).
  const { data: latest } = await client
    .from('workflow_versions')
    .select('version')
    .eq('user_id', userId)
    .eq('workflow_id', id)
    .order('version', { ascending: false })
    .limit(1)
    .single();
  const version = (latest?.version ?? 0) + 1;

  const definition = {
    name: typeof def.name === 'string' ? def.name : 'Workflow',
    nodes: def.nodes,
    edges: Array.isArray(def.edges) ? def.edges : [],
  };

  const { data, error } = await client
    .from('workflow_versions')
    .insert({
      user_id: userId,
      workflow_id: id,
      version,
      name: typeof body?.name === 'string' ? body.name : definition.name,
      definition,
    })
    .select('id, version, published_at')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ version: data });
}
