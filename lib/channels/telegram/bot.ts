/**
 * Thin, stateless Telegram helpers for the webhook path. We use grammY's `Api`
 * directly (no long-running `Bot` instance) — each call constructs an Api with
 * the bot token from settings. grammY is imported lazily so the pure parsing
 * helpers can be used (and unit-tested) without loading the SDK.
 */

const TELEGRAM_MAX = 4096;

export interface ParsedUpdate {
  chatId: number;
  fromId: number;
  text: string;
  /** Command name without the leading slash / @botname suffix, or null. */
  command: string | null;
  /** Text after the command. */
  args: string;
}

/** Extract the bits we care about from a Telegram update; null if not a text message. */
export function parseUpdate(body: unknown): ParsedUpdate | null {
  const msg = (body as { message?: { chat?: { id?: number }; from?: { id?: number }; text?: unknown } })?.message;
  if (!msg || !msg.chat || typeof msg.chat.id !== 'number' || typeof msg.text !== 'string') {
    return null;
  }
  const text = msg.text;
  let command: string | null = null;
  let args = '';
  if (text.startsWith('/')) {
    const sp = text.indexOf(' ');
    const raw = sp === -1 ? text.slice(1) : text.slice(1, sp);
    command = raw.split('@')[0].toLowerCase(); // strip @botname mention
    args = sp === -1 ? '' : text.slice(sp + 1).trim();
  }
  return {
    chatId: msg.chat.id,
    fromId: typeof msg.from?.id === 'number' ? msg.from.id : msg.chat.id,
    text,
    command,
    args,
  };
}

/** Split a reply into Telegram-sized chunks, preferring newline breaks. */
export function chunk(text: string, size = TELEGRAM_MAX): string[] {
  if (text.length <= size) return [text];
  const parts: string[] = [];
  let rest = text;
  while (rest.length > size) {
    let cut = rest.lastIndexOf('\n', size);
    if (cut < size * 0.5) cut = size; // no usable newline — hard cut
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n/, '');
  }
  if (rest) parts.push(rest);
  return parts;
}

export async function sendReply(token: string, chatId: number, text: string): Promise<void> {
  const { Api } = await import('grammy');
  const api = new Api(token);
  for (const part of chunk(text)) {
    if (part.trim()) await api.sendMessage(chatId, part);
  }
}

export async function sendTyping(token: string, chatId: number): Promise<void> {
  try {
    const { Api } = await import('grammy');
    await new Api(token).sendChatAction(chatId, 'typing');
  } catch {
    /* non-fatal — typing indicator is best-effort */
  }
}
