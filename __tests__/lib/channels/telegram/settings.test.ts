/**
 * Tests for lib/channels/telegram/settings.ts — verifies the bot token and
 * shared API key are encrypted at rest and round-trip correctly. The Supabase
 * service client is mocked with a tiny in-memory single-row store.
 */

process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-telegram-secret-key';

let stored: Record<string, unknown> | null = null;

jest.mock('@/lib/auth/admin', () => ({
  getServiceClient: jest.fn(() => ({
    from: () => ({
      upsert: async (row: Record<string, unknown>) => {
        stored = row;
        return { error: null };
      },
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: stored, error: null }),
        }),
      }),
    }),
  })),
}));

import { loadTelegramSettings, saveTelegramSettings } from '@/lib/channels/telegram/settings';

describe('telegram settings', () => {
  beforeEach(() => {
    stored = null;
  });

  it('encrypts secrets on save and decrypts on load (round-trip)', async () => {
    await saveTelegramSettings({
      botToken: '123456:ABC-DEF_ghi', // real token format contains a colon
      mode: 'shared',
      allowlist: [111, 222],
      sharedApiKey: 'lucy_sk_test_value',
      defaultProvider: 'anthropic',
      defaultModel: 'claude-sonnet-4-6',
      enabled: true,
    });

    // Secrets are NOT stored in plaintext.
    expect(stored!.bot_token_encrypted).not.toBe('123456:ABC-DEF_ghi');
    expect(stored!.shared_api_key_encrypted).not.toBe('lucy_sk_test_value');

    const loaded = await loadTelegramSettings();
    expect(loaded).not.toBeNull();
    expect(loaded!.botToken).toBe('123456:ABC-DEF_ghi');
    expect(loaded!.sharedApiKey).toBe('lucy_sk_test_value');
    expect(loaded!.mode).toBe('shared');
    expect(loaded!.allowlist).toEqual([111, 222]);
    expect(loaded!.defaultModel).toBe('claude-sonnet-4-6');
    expect(loaded!.enabled).toBe(true);
  });

  it('returns null when no settings row exists', async () => {
    expect(await loadTelegramSettings()).toBeNull();
  });

  it('clears a secret when saved as null', async () => {
    await saveTelegramSettings({ botToken: null });
    expect(stored!.bot_token_encrypted).toBeNull();
  });
});
