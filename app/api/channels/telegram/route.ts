import type { NextRequest } from 'next/server';
import { after } from 'next/server';
import { loadTelegramSettings } from '@/lib/channels/telegram/settings';
import { parseUpdate } from '@/lib/channels/telegram/bot';
import { handleUpdate } from '@/lib/channels/telegram/handle';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Constant-time string compare for the webhook secret token. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

/**
 * Telegram webhook. Verifies the secret token, returns 200 immediately, and
 * processes the reply in `after()` so a slow LLM/tool turn never trips
 * Telegram's delivery retry. No-ops when the bot is not configured/enabled.
 */
export async function POST(req: NextRequest) {
  const settings = await loadTelegramSettings();
  if (!settings || !settings.enabled || !settings.botToken) {
    return new Response('ok'); // not configured — silently accept
  }

  const provided = req.headers.get('x-telegram-bot-api-secret-token') ?? '';
  if (!settings.webhookSecret || !safeEqual(provided, settings.webhookSecret)) {
    return new Response('unauthorized', { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response('ok');
  }

  const update = parseUpdate(body);
  if (update) {
    after(() => handleUpdate(update, settings));
  }
  return new Response('ok');
}
