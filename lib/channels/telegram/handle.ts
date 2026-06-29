import { getServiceClient } from '@/lib/auth/admin';
import { encryptSecret } from '@/lib/mcp/secret';
import { createApiKey } from '@/lib/auth/api-keys';
import { parseSSEStream } from '@/lib/utils/stream';
import type { ParsedUpdate } from './bot';
import { sendReply, sendTyping } from './bot';
import { resolveTelegramUser } from './resolve';
import type { TelegramSettings } from './settings';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://justlucy.ai').replace(/\/+$/, '');

// Server-to-server self-call must use loopback, NOT the public hostname: the
// host can't reach its own public URL (NAT hairpin), the same reason every
// server-side Supabase client uses SUPABASE_INTERNAL_URL. PORT is set in the
// standalone process env (3001 on web04); fall back to the public URL elsewhere.
const INTERNAL_BASE =
  process.env.INTERNAL_API_URL ||
  (process.env.PORT ? `http://127.0.0.1:${process.env.PORT}` : SITE_URL);

/**
 * Process one parsed Telegram update: route commands, otherwise run the message
 * through Lucy's chat pipeline (memory + MCP tools) via a server-to-server call
 * to /api/chat authenticated as the resolved user's Lucy API key.
 *
 * Runs inside the webhook route's `after()` — never throws to the caller.
 */
export async function handleUpdate(update: ParsedUpdate, settings: TelegramSettings): Promise<void> {
  const token = settings.botToken;
  if (!token) return;

  try {
    if (update.command === 'start') {
      await sendReply(token, update.chatId, startMessage(settings));
      return;
    }
    if (update.command === 'link') {
      await sendReply(token, update.chatId, await handleLink(update, settings));
      return;
    }
    if (update.command === 'reset') {
      await sendReply(token, update.chatId, 'Conversation reset. (Each message is handled fresh in v1.)');
      return;
    }
    // Ignore other slash commands silently rather than treating them as chat.
    if (update.command) {
      await sendReply(token, update.chatId, `Unknown command /${update.command}. Try /start.`);
      return;
    }

    await handleChat(update, settings, token);
  } catch (err) {
    console.error('[telegram/handle]', err instanceof Error ? err.message : String(err));
    try {
      await sendReply(token, update.chatId, '⚠️ Lucy hit an error. Please try again.');
    } catch {
      /* give up */
    }
  }
}

function startMessage(settings: TelegramSettings): string {
  if (settings.mode === 'linked') {
    return [
      'Hi, I’m Lucy. To use your own Lucy account here, open Settings → Connect Telegram in the web app, copy the code, and send me:',
      '',
      '/link YOUR_CODE',
    ].join('\n');
  }
  return 'Hi, I’m Lucy. Send me a message and I’ll help.';
}

async function handleLink(update: ParsedUpdate, settings: TelegramSettings): Promise<string> {
  if (settings.mode !== 'linked') {
    return 'Linking isn’t needed for this bot — just send a message.';
  }
  const code = update.args.trim();
  if (!code) return 'Usage: /link YOUR_CODE (get the code from Settings → Connect Telegram).';

  const client = getServiceClient();
  if (!client) return 'Linking is unavailable right now.';

  const { data: codeRow } = await client
    .from('telegram_link_codes')
    .select('lucy_user_id, expires_at, used')
    .eq('code', code)
    .maybeSingle();

  if (!codeRow || codeRow.used || new Date(codeRow.expires_at as string).getTime() < Date.now()) {
    return 'That code is invalid or expired. Generate a fresh one in Settings → Connect Telegram.';
  }

  const minted = await createApiKey(codeRow.lucy_user_id as string, 'telegram');
  if (!minted) return 'Couldn’t create an access key. Please try again.';

  const { error } = await client.from('telegram_links').upsert(
    {
      telegram_user_id: update.fromId,
      lucy_user_id: codeRow.lucy_user_id,
      api_key_encrypted: encryptSecret(minted.key),
      linked_at: new Date().toISOString(),
    },
    { onConflict: 'telegram_user_id' }
  );
  if (error) return 'Couldn’t save the link. Please try again.';

  await client.from('telegram_link_codes').update({ used: true }).eq('code', code);
  return '✅ Linked! Your Telegram is now connected to your Lucy account.';
}

/**
 * The model/provider to use for a given Lucy user: their own saved default
 * (set in the web app, stored per-user in lucy.user_preferences) so each user
 * chats with THEIR model on THEIR key. Falls back to the bot's global default
 * when the user has never picked one.
 */
async function modelForUser(
  userId: string,
  fallback: { model: string; provider: string },
): Promise<{ model: string; provider: string }> {
  const client = getServiceClient();
  if (!client) return fallback;
  const { data } = await client
    .from('user_preferences')
    .select('default_model, default_provider')
    .eq('user_id', userId)
    .maybeSingle();
  return {
    model: (data?.default_model as string) || fallback.model,
    provider: (data?.default_provider as string) || fallback.provider,
  };
}

async function handleChat(update: ParsedUpdate, settings: TelegramSettings, token: string): Promise<void> {
  const resolved = await resolveTelegramUser(update.fromId, settings);
  if (resolved.kind === 'unauthorized') {
    await sendReply(token, update.chatId, 'Sorry, you’re not authorized to use this bot.');
    return;
  }
  if (resolved.kind === 'needsLink') {
    await sendReply(
      token,
      update.chatId,
      'Link your Lucy account first: open Settings → Connect Telegram, then send /link YOUR_CODE.'
    );
    return;
  }

  await sendTyping(token, update.chatId);

  const { model, provider } = await modelForUser(resolved.lucyUserId, {
    model: settings.defaultModel,
    provider: settings.defaultProvider,
  });

  const res = await fetch(`${INTERNAL_BASE}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${resolved.apiKey}`,
      'x-memory-enabled': '1',
    },
    body: JSON.stringify({
      messages: [{ role: 'user', content: update.text }],
      model,
      provider,
    }),
  });

  if (!res.ok || !res.body) {
    await sendReply(token, update.chatId, '⚠️ Lucy couldn’t respond right now. Please try again.');
    return;
  }

  let reply = '';
  await parseSSEStream(
    res.body,
    (c) => {
      reply += c;
    },
    () => {},
    () => {}
  );

  await sendReply(token, update.chatId, reply.trim() || 'I couldn’t generate a response.');
}
