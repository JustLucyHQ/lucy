// __tests__/lib/mcp/secret.test.ts
import { createCipheriv, randomBytes, scryptSync } from 'crypto';
import { encryptSecret, decryptSecret, decryptSecretMaybe } from '@/lib/mcp/secret';
describe('secret', () => {
  const KEY = 'test-service-role-key-1234567890';
  it('round-trips a value', () => {
    const enc = encryptSecret('ghp_supersecret', KEY);
    expect(enc).not.toContain('ghp_supersecret');
    expect(decryptSecret(enc, KEY)).toBe('ghp_supersecret');
  });
  it('different ciphertext each time (random IV)', () => {
    expect(encryptSecret('x', KEY)).not.toEqual(encryptSecret('x', KEY));
  });
  it('returns null on tampered/garbage input', () => {
    expect(decryptSecret('not-valid', KEY)).toBeNull();
  });
  it('throws when no key is available', () => {
    expect(() => encryptSecret('x', '')).toThrow();
  });
});

// Regression test for LOW-3: the AES key used to be derived from a single
// hardcoded salt ('lucy-mcp-secret') shared by every encrypted value. Now
// encryptSecret() embeds a fresh random salt per call (4-part
// "salt:iv:tag:ciphertext" format) while decryptSecret() must still decode
// the OLD 3-part "iv:tag:ciphertext" format (via the legacy hardcoded salt)
// so every value already in the production database keeps decrypting.
describe('secret — per-value random salt (LOW-3)', () => {
  const KEY = 'test-service-role-key-1234567890';

  it('new ciphertexts use the 4-part salt:iv:tag:ciphertext format', () => {
    const enc = encryptSecret('sk-my-key', KEY);
    expect(enc.split(':')).toHaveLength(4);
  });

  it('two encryptions of the same plaintext use different salts', () => {
    const a = encryptSecret('same-value', KEY).split(':')[0];
    const b = encryptSecret('same-value', KEY).split(':')[0];
    expect(a).not.toEqual(b);
  });

  it('decrypts a value produced by the OLD 3-part legacy-salt format', () => {
    // Reproduce exactly what the pre-LOW-3 encryptSecret() produced: a fixed
    // hardcoded salt, no salt segment in the output.
    const LEGACY_SALT = 'lucy-mcp-secret';
    const key = scryptSync(KEY, LEGACY_SALT, 32);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ct = Buffer.concat([cipher.update('legacy-plaintext-secret', 'utf8'), cipher.final()]);
    const legacyCiphertext = `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${ct.toString('hex')}`;

    expect(legacyCiphertext.split(':')).toHaveLength(3);
    expect(decryptSecret(legacyCiphertext, KEY)).toBe('legacy-plaintext-secret');
    expect(decryptSecretMaybe(legacyCiphertext, KEY)).toBe('legacy-plaintext-secret');
  });

  it('decryptSecretMaybe recognizes the new 4-part format as ciphertext, not plaintext', () => {
    const enc = encryptSecret('sk-another-key', KEY);
    expect(decryptSecretMaybe(enc, KEY)).toBe('sk-another-key');
  });
});

// Regression test for MED-6: memory_settings.embedder_api_key was stored in
// plaintext while every other secret column used encryptSecret/decryptSecret.
// decryptSecretMaybe() must decrypt newly-encrypted values, and it must also
// tolerate rows written before this fix (legacy plaintext) so an existing
// deployment's embedder key doesn't silently stop working on upgrade.
describe('decryptSecretMaybe — legacy plaintext + encrypted values', () => {
  const KEY = 'test-service-role-key-1234567890';

  it('decrypts a properly encrypted value', () => {
    const enc = encryptSecret('sk-my-embedder-key', KEY);
    expect(decryptSecretMaybe(enc, KEY)).toBe('sk-my-embedder-key');
  });

  it('passes through a legacy plaintext value unchanged', () => {
    expect(decryptSecretMaybe('sk-legacy-plaintext-key', KEY)).toBe('sk-legacy-plaintext-key');
  });

  it('returns empty string for null/undefined/empty input', () => {
    expect(decryptSecretMaybe(null, KEY)).toBe('');
    expect(decryptSecretMaybe(undefined, KEY)).toBe('');
    expect(decryptSecretMaybe('', KEY)).toBe('');
  });
});
