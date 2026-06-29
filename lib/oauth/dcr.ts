// lib/oauth/dcr.ts — Dynamic Client Registration (RFC 7591). Registers Lucy as a
// public (PKCE) client with a provider's authorization server once, then caches
// the client_id in lucy.oauth_clients (service-role table) for reuse.
import { createClient } from '@supabase/supabase-js';
import { encryptSecret, decryptSecret } from '@/lib/mcp/secret';

function svc() {
  return createClient(
    (process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { db: { schema: 'lucy' }, auth: { persistSession: false } },
  );
}

export interface DcrClient {
  clientId: string;
  clientSecret?: string;
}

export async function getOrRegisterClient(
  provider: string,
  registrationEndpoint: string,
  redirectUri: string,
): Promise<DcrClient | null> {
  const s = svc();
  const { data } = await s
    .from('oauth_clients')
    .select('client_id, client_secret_enc')
    .eq('provider', provider)
    .maybeSingle();
  if (data?.client_id) {
    return {
      clientId: data.client_id,
      clientSecret: data.client_secret_enc ? decryptSecret(data.client_secret_enc) ?? undefined : undefined,
    };
  }
  if (!registrationEndpoint) return null;

  try {
    const r = await fetch(registrationEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_name: 'Lucy (justlucy.ai)',
        redirect_uris: [redirectUri],
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        application_type: 'web',
      }),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as Record<string, any>;
    if (!j.client_id) return null;

    await s.from('oauth_clients').upsert(
      {
        provider,
        client_id: j.client_id,
        client_secret_enc: j.client_secret ? encryptSecret(j.client_secret) : null,
        registration: j,
      },
      { onConflict: 'provider' },
    );
    return { clientId: j.client_id, clientSecret: j.client_secret ?? undefined };
  } catch {
    return null;
  }
}
