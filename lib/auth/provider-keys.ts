/**
 * Server-side encryption for stored provider API keys (lucy.provider_configs).
 *
 * New rows are AES-256-GCM encrypted (via lib/mcp/secret.ts, keyed from
 * SUPABASE_SERVICE_ROLE_KEY) and prefixed with `enc:v1:`. Rows written before
 * this change used a reversible XOR obfuscation with a public salt — those are
 * still readable (legacy fallback) and get re-encrypted opportunistically when
 * read through /api/provider-keys.
 *
 * Server-only: do not import from client components.
 */

import { encryptSecret, decryptSecret } from '@/lib/mcp/secret';

const ENC_PREFIX = 'enc:v1:';
const LEGACY_XOR_SALT = 'lucy_api_key_v1';

export function encryptProviderKey(plain: string): string {
  return ENC_PREFIX + encryptSecret(plain);
}

export function isLegacyProviderKey(stored: string | null | undefined): boolean {
  return Boolean(stored) && !String(stored).startsWith(ENC_PREFIX);
}

function legacyXorDecode(hex: string): string {
  const bytes: string[] = [];
  for (let i = 0; i < hex.length; i += 2) bytes.push(hex.slice(i, i + 2));
  return bytes
    .map((byte, i) =>
      String.fromCharCode(parseInt(byte, 16) ^ LEGACY_XOR_SALT.charCodeAt(i % LEGACY_XOR_SALT.length))
    )
    .join('');
}

export function decryptProviderKey(stored: string | null | undefined): string {
  if (!stored) return '';
  if (stored.startsWith(ENC_PREFIX)) {
    return decryptSecret(stored.slice(ENC_PREFIX.length)) ?? '';
  }
  try {
    return legacyXorDecode(stored);
  } catch {
    return '';
  }
}
