process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

import {
  encryptProviderKey,
  decryptProviderKey,
  isLegacyProviderKey,
} from '@/lib/auth/provider-keys';

// Mirror of the legacy XOR obfuscation that older rows were written with
function legacyXorEncode(plain: string): string {
  const salt = 'lucy_api_key_v1';
  return Array.from(plain)
    .map((ch, i) => String.fromCharCode(ch.charCodeAt(0) ^ salt.charCodeAt(i % salt.length)))
    .map((ch) => ch.charCodeAt(0).toString(16).padStart(2, '0'))
    .join('');
}

describe('provider-keys encryption', () => {
  it('round-trips an AES-encrypted key', () => {
    const stored = encryptProviderKey('sk-test-1234567890abcdef');
    expect(stored.startsWith('enc:v1:')).toBe(true);
    expect(decryptProviderKey(stored)).toBe('sk-test-1234567890abcdef');
  });

  it('produces different ciphertext per call (random IV)', () => {
    expect(encryptProviderKey('same-key')).not.toBe(encryptProviderKey('same-key'));
  });

  it('decrypts legacy XOR-obfuscated rows', () => {
    const legacy = legacyXorEncode('sk-legacy-key-000');
    expect(isLegacyProviderKey(legacy)).toBe(true);
    expect(decryptProviderKey(legacy)).toBe('sk-legacy-key-000');
  });

  it('identifies new-format rows as non-legacy', () => {
    expect(isLegacyProviderKey(encryptProviderKey('x'))).toBe(false);
    expect(isLegacyProviderKey('')).toBe(false);
    expect(isLegacyProviderKey(null)).toBe(false);
  });

  it('returns empty string for tampered AES ciphertext', () => {
    const stored = encryptProviderKey('sk-test');
    const tampered = stored.slice(0, -2) + (stored.endsWith('aa') ? 'bb' : 'aa');
    expect(decryptProviderKey(tampered)).toBe('');
  });

  it('returns empty string for null/empty input', () => {
    expect(decryptProviderKey(null)).toBe('');
    expect(decryptProviderKey('')).toBe('');
    expect(decryptProviderKey(undefined)).toBe('');
  });
});
