// GET /api/oauth/[provider]/callback — finish an OAuth Connect flow.
// Validates the CSRF state (+ carries the PKCE verifier) from the flow cookie,
// exchanges the code for a token server-side ('app' uses the client secret;
// 'dcr' uses the registered public client + PKCE verifier), stores it encrypted,
// and returns to the connectors page. The user is resolved from the session.
import { NextRequest, NextResponse } from 'next/server';
import { resolveMemoryAuth } from '@/lib/memory/auth';
import { getProvider, redirectUri } from '@/lib/oauth/providers';
import { discover } from '@/lib/oauth/discovery';
import { getOrRegisterClient } from '@/lib/oauth/dcr';
import { saveConnection, type TokenSet } from '@/lib/oauth/connections';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const base = (process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin).replace(/\/+$/, '');
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const oauthErr = url.searchParams.get('error_description') || url.searchParams.get('error');
  const back = (q: string) => NextResponse.redirect(`${base}/connectors?${q}`);

  if (oauthErr) return back(`error=${encodeURIComponent(oauthErr)}&provider=${provider}`);
  if (!code) return back(`error=missing_code&provider=${provider}`);

  // Validate CSRF state + recover the PKCE verifier from the flow cookie.
  let flow: { state: string; verifier?: string } | null = null;
  try {
    const raw = req.cookies.get(`oauth_flow_${provider}`)?.value;
    if (raw) flow = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch { /* fall through to bad_state */ }
  if (!state || !flow || flow.state !== state) return back(`error=bad_state&provider=${provider}`);

  const { userId } = await resolveMemoryAuth(req);
  if (!userId) return NextResponse.redirect(`${base}/auth/login`);

  const p = getProvider(provider);
  if (!p) return back(`error=not_configured&provider=${provider}`);
  const ruri = redirectUri(provider, base);

  let tokenUrl: string;
  const body: Record<string, string> = { grant_type: 'authorization_code', code, redirect_uri: ruri };

  if (p.kind === 'app') {
    tokenUrl = p.tokenUrl;
    body.client_id = p.clientId;
    body.client_secret = p.clientSecret;
    if (flow.verifier) body.code_verifier = flow.verifier;
  } else {
    const meta = await discover(p.remoteMcpUrl);
    if (!meta?.token_endpoint) return back(`error=discovery_failed&provider=${provider}`);
    const client = await getOrRegisterClient(provider, meta.registration_endpoint ?? '', ruri);
    if (!client) return back(`error=registration_failed&provider=${provider}`);
    tokenUrl = meta.token_endpoint;
    body.client_id = client.clientId;
    if (client.clientSecret) body.client_secret = client.clientSecret;
    if (flow.verifier) body.code_verifier = flow.verifier;
  }

  let token: TokenSet;
  try {
    const r = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams(body).toString(),
    });
    const j = (await r.json()) as Record<string, any>;
    if (!r.ok || j.error || !j.access_token) {
      return back(`error=${encodeURIComponent(j.error_description || j.error || 'token_exchange_failed')}&provider=${provider}`);
    }
    token = {
      access_token: j.access_token,
      refresh_token: j.refresh_token ?? null,
      expires_in: typeof j.expires_in === 'number' ? j.expires_in : null,
      scope: j.scope ?? p.scopes.join(' '),
    };
  } catch {
    return back(`error=exchange_error&provider=${provider}`);
  }

  try {
    await saveConnection(userId, provider, provider, token);
  } catch {
    return back(`error=save_failed&provider=${provider}`);
  }

  const res = back(`connected=${provider}`);
  res.cookies.set(`oauth_flow_${provider}`, '', { path: '/', maxAge: 0 });
  return res;
}
