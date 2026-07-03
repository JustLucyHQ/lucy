// lib/mcp/secret.ts
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const _keyCache = new Map<string, Buffer>();
function keyFrom(secret: string): Buffer {
  if (!secret) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for connector secret encryption');
  let k = _keyCache.get(secret);
  if (!k) { k = scryptSync(secret, 'lucy-mcp-secret', 32); _keyCache.set(secret, k); }
  return k;
}

/** "iv:tag:ciphertext" all hex. */
export function encryptSecret(plain: string, secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFrom(secret), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${ct.toString('hex')}`;
}
export function decryptSecret(enc: string, secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''): string | null {
  try {
    const [ivH, tagH, ctH] = enc.split(':');
    if (!ivH || !tagH || !ctH) return null;
    const d = createDecipheriv('aes-256-gcm', keyFrom(secret), Buffer.from(ivH, 'hex'));
    d.setAuthTag(Buffer.from(tagH, 'hex'));
    return Buffer.concat([d.update(Buffer.from(ctH, 'hex')), d.final()]).toString('utf8');
  } catch { return null; }
}

const ENC_FORMAT = /^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/i;

/**
 * Decrypt a column that may hold either an encryptSecret() ciphertext or a
 * legacy plaintext value written before that column was encrypted at rest.
 * Returns '' for anything falsy or that fails to decrypt.
 */
export function decryptSecretMaybe(value: string | null | undefined, secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''): string {
  if (!value) return '';
  if (!ENC_FORMAT.test(value)) return value;
  return decryptSecret(value, secret) ?? '';
}
