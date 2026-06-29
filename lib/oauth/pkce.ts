// lib/oauth/pkce.ts — PKCE (RFC 7636) helpers for the OAuth 2.1 / MCP flow.
import { randomBytes, createHash } from 'crypto';

export function makePkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}
