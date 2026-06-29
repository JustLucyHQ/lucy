// __tests__/lib/mcp/installer.test.ts
import { validateConfig, maskConfig, mergeConfigForStorage, decodeConfig } from '@/lib/mcp/installer';
import { encryptSecret } from '@/lib/mcp/secret';
import type { ConfigField } from '@/lib/mcp/types';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key-for-mcp-installer-spec';
const schema2 = [{ key: 'TOKEN', label: 'T', type: 'secret', required: true }, { key: 'TEAM', label: 'Team', type: 'text', required: false }] as const;
const schema: ConfigField[] = [
  { key: 'TOKEN', label: 'Token', type: 'secret', required: true },
  { key: 'TEAM', label: 'Team', type: 'text', required: false },
];
describe('validateConfig', () => {
  it('rejects missing required field', () => {
    expect(validateConfig(schema, { TEAM: 'x' }).ok).toBe(false);
  });
  it('accepts when required present', () => {
    expect(validateConfig(schema, { TOKEN: 'abc' }).ok).toBe(true);
  });
});
describe('maskConfig', () => {
  it('replaces secret values with a marker, keeps text', () => {
    expect(maskConfig(schema, { TOKEN: 'abc', TEAM: 'eng' })).toEqual({ TOKEN: '__set__', TEAM: 'eng' });
  });
  it('omits secret marker when unset', () => {
    expect(maskConfig(schema, { TEAM: 'eng' })).toEqual({ TEAM: 'eng' });
  });
});

describe('mergeConfigForStorage', () => {
  it('preserves an existing secret unchanged when re-saved with the mask (no double-encryption)', () => {
    const existing = { TOKEN: encryptSecret('abc123') };
    const merged = mergeConfigForStorage(schema2 as any, existing, { TOKEN: '__set__', TEAM: 'eng' });
    expect(merged.TOKEN).toBe(existing.TOKEN);                 // byte-identical ciphertext, not re-encrypted
    expect(merged.TEAM).toBe('eng');
    expect(decodeConfig(schema2 as any, merged).TOKEN).toBe('abc123');  // still decrypts to the original
  });
  it('encodes a brand-new secret exactly once', () => {
    const merged = mergeConfigForStorage(schema2 as any, {}, { TOKEN: 'newval' });
    expect(merged.TOKEN).not.toBe('newval');
    expect(decodeConfig(schema2 as any, merged).TOKEN).toBe('newval');
  });
  it('keeps an existing secret when re-saved with a BLANK value (not just the mask)', () => {
    const existing = { TOKEN: encryptSecret('keepme') };
    const merged = mergeConfigForStorage(schema2 as any, existing, { TOKEN: '', TEAM: 'eng' });
    expect(merged.TOKEN).toBe(existing.TOKEN);                          // unchanged
    expect(decodeConfig(schema2 as any, merged).TOKEN).toBe('keepme');  // still decrypts
    expect(merged.TEAM).toBe('eng');
  });
});
