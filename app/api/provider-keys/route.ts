import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resolveMemoryAuth } from '@/lib/memory/auth';
import {
  encryptProviderKey,
  decryptProviderKey,
  isLegacyProviderKey,
} from '@/lib/auth/provider-keys';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Provider API key storage with real encryption.
 *
 * The browser storage adapter used to XOR-obfuscate keys and write the table
 * directly; AES-256-GCM needs the server-only SUPABASE_SERVICE_ROLE_KEY, so
 * reads/writes now go through this route. userId is always derived from the
 * session — never from the request body.
 */

function getServiceClient() {
  const url = (process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !svcKey) return null;
  return createClient(url, svcKey, { db: { schema: 'lucy' } });
}

export async function GET(req: NextRequest) {
  const { userId } = await resolveMemoryAuth(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const svc = getServiceClient();
  if (!svc) return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });

  const { data, error } = await svc
    .from('provider_configs')
    .select('provider, api_key_encrypted, is_active')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const configs = (data ?? []).map((row) => {
    const apiKey = decryptProviderKey(row.api_key_encrypted as string);

    // Opportunistic migration: re-encrypt legacy XOR rows with AES-256-GCM
    if (apiKey && isLegacyProviderKey(row.api_key_encrypted as string)) {
      svc
        .from('provider_configs')
        .update({ api_key_encrypted: encryptProviderKey(apiKey), updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('provider', row.provider as string)
        .then(() => {});
    }

    return {
      provider: row.provider as string,
      apiKey,
      isActive: row.is_active as boolean,
    };
  });

  return NextResponse.json({ configs });
}

export async function POST(req: NextRequest) {
  const { userId } = await resolveMemoryAuth(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const svc = getServiceClient();
  if (!svc) return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });

  const body = await req.json().catch(() => null);
  const provider = typeof body?.provider === 'string' ? body.provider.trim() : '';
  const apiKey = typeof body?.apiKey === 'string' ? body.apiKey : '';
  if (!provider || provider.length > 40) {
    return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
  }

  const { error } = await svc.from('provider_configs').upsert(
    {
      user_id: userId,
      provider,
      api_key_encrypted: apiKey ? encryptProviderKey(apiKey) : '',
      is_active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,provider' }
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
