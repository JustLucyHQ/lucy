// lib/security/ssrf-guard.ts
// Shared SSRF guard — one source of truth for "is this URL safe for the server
// to fetch on a caller's behalf". Used unconditionally by paths that have no
// legitimate reason to reach internal infra (custom MCP connectors, the voice
// transcribe baseUrl override); the workflow HTTP node applies the same
// isPrivateHost() check but gates it behind WORKFLOW_MULTI_TENANT, since a
// trusted single-tenant self-host legitimately wants to call its own
// localhost services (e.g. a local Ollama instance).

/** True for loopback / link-local / RFC-1918 / .local|.internal hosts. */
export function isPrivateHost(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (!h || h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.|::1$)/.test(h)) return true;
  const m = h.match(/^172\.(\d{1,3})\./);
  return m ? Number(m[1]) >= 16 && Number(m[1]) <= 31 : false;
}

/**
 * Throws unless `raw` is a well-formed http(s) URL pointing at a public host.
 * Call this at both registration time AND connection/fetch time — checking
 * only once at registration is vulnerable to DNS rebinding (the host could
 * resolve to a public IP when validated, then a private one when connected).
 */
export function assertPublicHttpUrl(raw: string, context = 'request'): void {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error(`${context}: invalid URL`);
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error(`${context}: only http(s) URLs are allowed`);
  }
  if (isPrivateHost(u.hostname)) {
    throw new Error(`${context}: refusing to reach a private/internal address`);
  }
}
