import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createApiKey, listApiKeys, revokeApiKey, deleteApiKey } from '@/lib/auth/api-keys';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function getAuthenticatedUserId(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader) return null;

  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return null;

  const url = (process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;

  const supabase = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function GET(req: NextRequest) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const keys = await listApiKeys(userId);
  return NextResponse.json({ keys });
}

export async function POST(req: NextRequest) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const name = body.name || 'Default';

  const result = await createApiKey(userId, name);
  if (!result) {
    return NextResponse.json({ error: 'Failed to create API key' }, { status: 500 });
  }

  return NextResponse.json({
    key: result.key,
    id: result.id,
    prefix: result.prefix,
    message: 'Store this key securely — it will not be shown again.',
  }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const keyId = url.searchParams.get('id');
  const action = url.searchParams.get('action') || 'revoke';

  if (!keyId) {
    return NextResponse.json({ error: 'Missing key id' }, { status: 400 });
  }

  const success = action === 'delete'
    ? await deleteApiKey(userId, keyId)
    : await revokeApiKey(userId, keyId);

  if (!success) {
    return NextResponse.json({ error: 'Failed to modify key' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
