// __tests__/lib/mcp/secret.test.ts
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
