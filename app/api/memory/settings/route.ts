import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resolveMemoryAuth } from '@/lib/memory/auth';
import { encryptSecret } from '@/lib/mcp/secret';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Service client — required to WRITE memory_settings (RLS allows writes to service_role only). */
function serviceClient() {
  const url = (process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { db: { schema: 'lucy' } });
}

// Only these columns may be written via the API.
const ALLOWED_FIELDS = new Set([
  'enabled',
  'embedder_provider',
  'embedder_model',
  'embedder_dimensions',
  'embedder_base_url',
  'embedder_api_key',
  'contradiction_policy',
  'deletion_grace_days',
]);

export async function GET() {
  const client = serviceClient();
  if (!client) return Response.json({ enabled: false });
  const { data, error } = await client.from('memory_settings').select('*').eq('id', 1).maybeSingle();
  if (error) console.warn('[memory/settings] read failed:', error.message);
  if (!data) return Response.json({ enabled: false });
  // NEVER return the embedder API key to the client — only whether one is set.
  const { embedder_api_key, ...safe } = data as Record<string, unknown>;
  return Response.json({ ...safe, embedder_has_key: Boolean(embedder_api_key) });
}

export async function POST(req: NextRequest) {
  // Mutating deployment config requires the admin role (auth app_metadata
  // lucy_role — see lib/auth/admin.ts; manageable from the Admin panel).
  const { userId } = await resolveMemoryAuth(req);
  if (!userId) return Response.json({ ok: false }, { status: 401 });
  const { isAdminUser } = await import('@/lib/auth/admin');
  if (!(await isAdminUser(userId))) {
    return Response.json({ ok: false, error: 'admin only' }, { status: 403 });
  }

  const client = serviceClient();
  if (!client) return Response.json({ ok: false, error: 'no service client' }, { status: 200 });

  const raw = (await req.json()) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (ALLOWED_FIELDS.has(k)) patch[k] = v;
  }
  if (Object.keys(patch).length === 0) {
    return Response.json({ ok: false, error: 'no valid fields' }, { status: 400 });
  }

  // Encrypt at rest, like every other secret column in this schema.
  if (typeof patch.embedder_api_key === 'string' && patch.embedder_api_key) {
    patch.embedder_api_key = encryptSecret(patch.embedder_api_key);
  }

  // Changing the embedding dimension reshapes the vector column (and clears any
  // existing embeddings, which are invalid at a new dimension). Do this first so
  // the settings row never points at a dimension the column can't hold.
  if (patch.embedder_dimensions !== undefined) {
    const dim = Number(patch.embedder_dimensions);
    if (!Number.isInteger(dim) || dim < 1 || dim > 16000) {
      return Response.json({ ok: false, error: 'invalid dimension' }, { status: 400 });
    }
    const { error: dimErr } = await client.rpc('set_embedding_dim', { p_dim: dim });
    if (dimErr) {
      console.error('[memory/settings] set_embedding_dim failed:', dimErr.message);
      return Response.json({ ok: false, error: dimErr.message }, { status: 500 });
    }
    patch.embedder_dimensions = dim;
  }

  const { error } = await client
    .from('memory_settings')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', 1);
  if (error) {
    console.error('[memory/settings] update failed:', error.message);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true });
}
