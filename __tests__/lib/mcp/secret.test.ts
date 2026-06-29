// __tests__/lib/mcp/secret.test.ts
import { encryptSecret, decryptSecret } from '@/lib/mcp/secret';
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
