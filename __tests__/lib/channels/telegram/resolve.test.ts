let linkRow: { lucy_user_id: string; api_key_encrypted: string } | null = null;

jest.mock('@/lib/auth/admin', () => ({
  getServiceClient: jest.fn(() => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: linkRow }) }) }),
    }),
  })),
}));

jest.mock('@/lib/mcp/secret', () => ({
  decryptSecret: (v: string) => (v === 'enc' ? 'plain-key' : null),
}));

import { resolveTelegramUser } from '@/lib/channels/telegram/resolve';
import type { TelegramSettings } from '@/lib/channels/telegram/settings';

const base: TelegramSettings = {
  botToken: 't',
  mode: 'shared',
  allowlist: [],
  sharedOwnerUserId: 'owner',
  sharedApiKey: 'owner-key',
  defaultProvider: 'anthropic',
  defaultModel: 'claude-sonnet-4-6',
  webhookSecret: 's',
  enabled: true,
};

describe('resolveTelegramUser', () => {
  beforeEach(() => {
    linkRow = null;
  });

  it('shared: returns the owner when allowlist is empty', async () => {
    expect(await resolveTelegramUser(123, base)).toEqual({ kind: 'ok', lucyUserId: 'owner', apiKey: 'owner-key' });
  });

  it('shared: blocks a non-allowlisted user', async () => {
    expect((await resolveTelegramUser(123, { ...base, allowlist: [999] })).kind).toBe('unauthorized');
  });

  it('shared: allows an allowlisted user', async () => {
    expect((await resolveTelegramUser(999, { ...base, allowlist: [999] })).kind).toBe('ok');
  });

  it('linked: needsLink when no binding exists', async () => {
    expect((await resolveTelegramUser(5, { ...base, mode: 'linked' })).kind).toBe('needsLink');
  });

  it('linked: ok with decrypted key when a binding exists', async () => {
    linkRow = { lucy_user_id: 'u1', api_key_encrypted: 'enc' };
    expect(await resolveTelegramUser(5, { ...base, mode: 'linked' })).toEqual({
      kind: 'ok',
      lucyUserId: 'u1',
      apiKey: 'plain-key',
    });
  });
});
