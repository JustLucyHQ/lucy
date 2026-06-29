import { parseUpdate, chunk } from '@/lib/channels/telegram/bot';

describe('parseUpdate', () => {
  it('parses a plain text message', () => {
    const u = parseUpdate({ message: { chat: { id: 5 }, from: { id: 9 }, text: 'hello' } });
    expect(u).toEqual({ chatId: 5, fromId: 9, text: 'hello', command: null, args: '' });
  });

  it('parses a command with args and strips @botname', () => {
    const u = parseUpdate({ message: { chat: { id: 1 }, from: { id: 1 }, text: '/link@LucyBot ABC123' } });
    expect(u?.command).toBe('link');
    expect(u?.args).toBe('ABC123');
  });

  it('falls back to chat id when from is missing', () => {
    const u = parseUpdate({ message: { chat: { id: 7 }, text: '/start' } });
    expect(u?.fromId).toBe(7);
    expect(u?.command).toBe('start');
  });

  it('returns null for non-text updates', () => {
    expect(parseUpdate({ message: { chat: { id: 1 } } })).toBeNull();
    expect(parseUpdate({})).toBeNull();
  });
});

describe('chunk', () => {
  it('returns one part when under the limit', () => {
    expect(chunk('short', 100)).toEqual(['short']);
  });

  it('splits long text into <= size parts that rejoin', () => {
    const text = 'a'.repeat(250);
    const parts = chunk(text, 100);
    expect(parts.every((p) => p.length <= 100)).toBe(true);
    expect(parts.join('')).toBe(text);
  });

  it('prefers a newline break near the limit', () => {
    const text = 'a'.repeat(60) + '\n' + 'b'.repeat(60);
    const parts = chunk(text, 100);
    expect(parts[0]).toBe('a'.repeat(60));
  });
});
