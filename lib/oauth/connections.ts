// lib/oauth/connections.ts
// Per-user OAuth token store (lucy.oauth_connections). Tokens are encrypted at
// rest with the same AES-256-GCM helper used for MCP secrets.
import { createClient } from '@supabase/supabase-js';
import { encryptSecret, decryptSecret } from '@/lib/mcp/secret';
import { getProvider } from './providers';

function svc() {
  return createClient(
    (process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { db: { schema: 'lucy' }, auth: { persistSession: false } },
  );
}

export interface TokenSet {
  access_token: string;
  refresh_token?: string | null;
  expires_in?: number | null;
  scope?: string | null;
}

/** Upsert a user's connection for a provider (encrypts access + refresh tokens). */
export async function saveConnection(
  userId: string,
  provider: string,
  connectorSlug: string,
  t: TokenSet,
  accountLabel?: string | null,
): Promise<void> {
  const expires_at = t.expires_in ? new Date(Date.now() + t.expires_in * 1000).toISOString() : null;
  const { error } = await svc()
    .from('oauth_connections')
    .upsert(
      {
        user_id: userId,
        provider,
        connector_slug: connectorSlug,
        access_token_enc: encryptSecret(t.access_token),
        refresh_token_enc: t.refresh_token ? encryptSecret(t.refresh_token) : null,
        expires_at,
        scope: t.scope ?? null,
        account_label: accountLabel ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,provider' },
    );
  if (error) throw error;
}

/** Provider slugs the user has connected (for marking connectors "Connected"). */
export async function listConnections(userId: string): Promise<string[]> {
  const { data } = await svc().from('oauth_connections').select('provider').eq('user_id', userId);
  return (data ?? []).map((r: { provider: string }) => r.provider);
}

/** Decrypted access token for a user's provider connection, or null. */
export async function getAccessToken(userId: string, provider: string): Promise<string | null> {
  const { data } = await svc()
    .from('oauth_connections')
    .select('access_token_enc')
    .eq('user_id', userId)
    .eq('provider', provider)
    .maybeSingle();
  return data?.access_token_enc ? decryptSecret(data.access_token_enc) : null;
}

/** Remove a user's connection for a provider. */
export async function deleteConnection(userId: string, provider: string): Promise<void> {
  await svc().from('oauth_connections').delete().eq('user_id', userId).eq('provider', provider);
}

/**
 * Like getAccessToken, but transparently refreshes an expired token using the
 * stored refresh_token + the provider's app credentials. Needed for native
 * tool execution: Google/Microsoft access tokens expire in ~1h. Slack bot
 * tokens have no expiry (expires_at is null) and are returned as-is.
 */
export async function getFreshAccessToken(userId: string, provider: string): Promise<string | null> {
  const { data } = await svc()
    .from('oauth_connections')
    .select('access_token_enc, refresh_token_enc, expires_at')
    .eq('user_id', userId)
    .eq('provider', provider)
    .maybeSingle();
  if (!data?.access_token_enc) return null;

  const access = decryptSecret(data.access_token_enc);
  // Non-expiring (Slack) or still valid (60s safety buffer) → use as-is.
  if (!data.expires_at) return access;
  if (Date.now() < Date.parse(data.expires_at as string) - 60_000) return access;

  const refresh = data.refresh_token_enc ? decryptSecret(data.refresh_token_enc) : null;
  if (!refresh) return access; // can't refresh — return the (likely stale) token

  const cfg = getProvider(provider);
  if (!cfg || cfg.kind !== 'app') return access;

  try {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refresh,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
    });
    // Microsoft requires the scope on refresh; Google does not.
    if (provider === 'microsoft-365') body.set('scope', cfg.scopes.join(' '));

    const res = await fetch(cfg.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) return access;
    const json = (await res.json()) as {
      access_token?: string; refresh_token?: string; expires_in?: number;
    };
    if (!json.access_token) return access;

    const upd: Record<string, unknown> = {
      access_token_enc: encryptSecret(json.access_token),
      expires_at: json.expires_in ? new Date(Date.now() + json.expires_in * 1000).toISOString() : null,
      updated_at: new Date().toISOString(),
    };
    // Microsoft rotates refresh tokens; Google reuses the old one.
    if (json.refresh_token) upd.refresh_token_enc = encryptSecret(json.refresh_token);
    await svc().from('oauth_connections').update(upd).eq('user_id', userId).eq('provider', provider);

    return json.access_token;
  } catch {
    return access;
  }
}
