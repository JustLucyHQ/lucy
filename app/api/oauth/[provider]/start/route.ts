// GET /api/oauth/[provider]/start — begin an OAuth Connect flow.
// 'app' providers (GitHub, Google…) redirect with the env client_id (+ PKCE /
// extra params per provider). 'dcr' providers (hosted remote MCPs) discover
// their authorization server, self-register a public PKCE client, then redirect
// with a PKCE challenge. State + the PKCE verifier are carried in an httpOnly
// cookie validated by /callback.
import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { resolveMemoryAuth } from '@/lib/memory/auth';
import { getProvider, redirectUri } from '@/lib/oauth/providers';
import { discover } from '@/lib/oauth/discovery';
import { getOrRegisterClient } from '@/lib/oauth/dcr';
import { makePkce } from '@/lib/oauth/pkce';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  // Pin to the configured site URL in production; fall back to the request origin
  // so local dev works on whatever port (3000/3001) without extra config.
  const base = (process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin).replace(/\/+$/, '');

  const { userId } = await resolveMemoryAuth(req);
  if (!userId) return NextResponse.redirect(`${base}/auth/login`);

  const p = getProvider(provider);
  if (!p) return NextResponse.redirect(`${base}/connectors?error=not_configured&provider=${provider}`);

  const state = randomBytes(16).toString('hex');
  const ruri = redirectUri(provider, base);
  let authorize: URL;
  const flow: { state: string; verifier?: string } = { state };

  if (p.kind === 'app') {
    authorize = new URL(p.authorizeUrl);
    authorize.searchParams.set('client_id', p.clientId);
    for (const [k, v] of Object.entries(p.extraAuthParams ?? {})) authorize.searchParams.set(k, v);
    if (p.usePkce) {
      const { verifier, challenge } = makePkce();
      flow.verifier = verifier;
      authorize.searchParams.set('code_challenge', challenge);
      authorize.searchParams.set('code_challenge_method', 'S256');
    }
  } else {
    const meta = await discover(p.remoteMcpUrl);
    if (!meta?.authorization_endpoint || !meta.registration_endpoint) {
      return NextResponse.redirect(`${base}/connectors?error=discovery_failed&provider=${provider}`);
    }
    const client = await getOrRegisterClient(provider, meta.registration_endpoint, ruri);
    if (!client) return NextResponse.redirect(`${base}/connectors?error=registration_failed&provider=${provider}`);

    const { verifier, challenge } = makePkce();
    flow.verifier = verifier;
    authorize = new URL(meta.authorization_endpoint);
    authorize.searchParams.set('client_id', client.clientId);
    authorize.searchParams.set('code_challenge', challenge);
    authorize.searchParams.set('code_challenge_method', 'S256');
  }

  authorize.searchParams.set('redirect_uri', ruri);
  authorize.searchParams.set('response_type', 'code');
  if (p.scopes.length) {
    const sep = p.kind === 'app' ? p.scopeSeparator ?? ' ' : ' ';
    authorize.searchParams.set('scope', p.scopes.join(sep));
  }
  authorize.searchParams.set('state', state);

  const res = NextResponse.redirect(authorize.toString());
  res.cookies.set(`oauth_flow_${provider}`, Buffer.from(JSON.stringify(flow)).toString('base64url'), {
    httpOnly: true,
    secure: base.startsWith('https'),
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
  return res;
}
