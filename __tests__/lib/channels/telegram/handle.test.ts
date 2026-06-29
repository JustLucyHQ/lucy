/**
 * handleUpdate chat path: shared-mode settings resolve to the owner without a
 * DB call, so we only mock grammY's Api (to capture sends) and global.fetch
 * (an SSE stream). parseSSEStream and the bot helpers run for real.
 */

const sent: Array<{ chatId: number; text: string }> = [];

jest.mock('grammy', () => ({
  Api: class {
    async sendMessage(chatId: number, text: string) {
      sent.push({ chatId, text });
    }
    async sendChatAction() {
      /* no-op */
    }
  },
}));

// parseSSEStream is its own utility; here we drive its callbacks directly so the
// handler test doesn't depend on web-stream APIs in the jest environment.
jest.mock('@/lib/utils/stream', () => ({
  parseSSEStream: jest.fn(
    async (
      _stream: unknown,
      onChunk: (c: string) => void,
      onDone: () => void
    ) => {
      onChunk('Hello');
      onChunk(' world');
      onDone();
    }
  ),
}));

import { handleUpdate } from '@/lib/channels/telegram/handle';
import type { TelegramSettings } from '@/lib/channels/telegram/settings';
import type { ParsedUpdate } from '@/lib/channels/telegram/bot';


const settings: TelegramSettings = {
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

const msg = (text: string, command: string | null = null, args = ''): ParsedUpdate => ({
  chatId: 1,
  fromId: 1,
  text,
  command,
  args,
});

describe('handleUpdate', () => {
  const realFetch = global.fetch;
  beforeEach(() => {
    sent.length = 0;
  });
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('accumulates SSE content from /api/chat and replies', async () => {
    global.fetch = jest.fn(async () => ({ ok: true, body: {} })) as unknown as typeof fetch;
    await handleUpdate(msg('hi'), settings);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/chat'),
      expect.objectContaining({ method: 'POST' })
    );
    expect(sent).toEqual([{ chatId: 1, text: 'Hello world' }]);
  });

  it('sends a friendly fallback when /api/chat fails', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, body: null })) as unknown as typeof fetch;
    await handleUpdate(msg('hi'), settings);
    expect(sent[0].text).toMatch(/couldn.t respond/i);
  });

  it('replies with a welcome on /start', async () => {
    await handleUpdate(msg('/start', 'start'), settings);
    expect(sent[0].text).toMatch(/Lucy/);
  });
});
