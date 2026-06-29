// lib/oauth/discovery.ts — discover a remote MCP server's OAuth Authorization
// Server metadata (RFC 8414). Endpoints can live on a different origin than the
// MCP URL (e.g. Stripe, Atlassian), so always use the discovered values.
export interface AsMeta {
  issuer?: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
}

// Cache per process — the AS metadata is stable.
const cache = new Map<string, AsMeta>();

async function fetchJson(url: string): Promise<any | null> {
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

export async function discover(remoteMcpUrl: string): Promise<AsMeta | null> {
  const origin = new URL(remoteMcpUrl).origin;
  const cached = cache.get(origin);
  if (cached) return cached;

  let j = await fetchJson(`${origin}/.well-known/oauth-authorization-server`);
  if (!(j?.authorization_endpoint && j?.token_endpoint)) {
    // Fallback: protected-resource metadata → its authorization server.
    const pr = await fetchJson(`${origin}/.well-known/oauth-protected-resource`);
    const as = Array.isArray(pr?.authorization_servers) ? pr.authorization_servers[0] : null;
    if (as) j = await fetchJson(`${String(as).replace(/\/+$/, '')}/.well-known/oauth-authorization-server`);
  }
  if (!(j?.authorization_endpoint && j?.token_endpoint)) return null;

  const meta: AsMeta = {
    issuer: j.issuer,
    authorization_endpoint: j.authorization_endpoint,
    token_endpoint: j.token_endpoint,
    registration_endpoint: j.registration_endpoint,
  };
  cache.set(origin, meta);
  return meta;
}
