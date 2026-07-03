// lib/mcp/secret.ts
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

// Kept forever: needed to decrypt ciphertexts written before per-value random
// salts were introduced. Not a weakness on its own — SUPABASE_SERVICE_ROLE_KEY
// is already a long, high-entropy secret rather than a low-entropy password,
// so a static salt doesn't enable rainbow-table attacks the way it would for a
// password hash — but per-value salts are still the standard, defence-in-depth
// practice for encryption keys.
const LEGACY_SALT = 'lucy-mcp-secret';

const _keyCache = new Map<string, Buffer>();
function keyFrom(secret: string, salt: string): Buffer {
  if (!secret) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for connector secret encryption');
  const cacheKey = `${salt}:${secret}`;
  let k = _keyCache.get(cacheKey);
  if (!k) { k = scryptSync(secret, salt, 32); _keyCache.set(cacheKey, k); }
  return k;
}

/** New format: "salt:iv:tag:ciphertext" all hex, fresh random salt per call. */
export function encryptSecret(plain: string, secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''): string {
  const salt = randomBytes(16).toString('hex');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFrom(secret, salt), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `${salt}:${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${ct.toString('hex')}`;
}

/**
 * Decrypts both formats:
 *  - legacy (3 parts):  "iv:tag:ciphertext"     -> uses the hardcoded LEGACY_SALT
 *  - current (4 parts): "salt:iv:tag:ciphertext" -> uses the embedded per-value salt
 */
export function decryptSecret(enc: string, secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''): string | null {
  try {
    const parts = enc.split(':');
    let saltHex: string, ivH: string, tagH: string, ctH: string;
    if (parts.length === 4) {
      [saltHex, ivH, tagH, ctH] = parts;
    } else if (parts.length === 3) {
      [ivH, tagH, ctH] = parts;
      saltHex = LEGACY_SALT;
    } else {
      return null;
    }
    if (!ivH || !tagH || !ctH) return null;
    const d = createDecipheriv('aes-256-gcm', keyFrom(secret, saltHex), Buffer.from(ivH, 'hex'));
    d.setAuthTag(Buffer.from(tagH, 'hex'));
    return Buffer.concat([d.update(Buffer.from(ctH, 'hex')), d.final()]).toString('utf8');
  } catch { return null; }
}

const ENC_FORMAT = /^(?:[0-9a-f]+:[0-9a-f]+:[0-9a-f]+|[0-9a-f]+:[0-9a-f]+:[0-9a-f]+:[0-9a-f]+)$/i;

/**
 * Decrypt a column that may hold an encryptSecret() ciphertext (old 3-part or
 * current 4-part format) or a legacy plaintext value written before that
 * column was encrypted at rest. Returns '' for anything falsy or undecryptable.
 */
export function decryptSecretMaybe(value: string | null | undefined, secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''): string {
  if (!value) return '';
  if (!ENC_FORMAT.test(value)) return value;
  return decryptSecret(value, secret) ?? '';
}
