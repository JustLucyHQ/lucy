import type { NextRequest } from 'next/server';
import { randomBytes } from 'crypto';
import { resolveMemoryAuth } from '@/lib/memory/auth';
import { isAdminUser } from '@/lib/auth/admin';
import { createApiKey } from '@/lib/auth/api-keys';
import { loadTelegramSettings, saveTelegramSettings } from '@/lib/channels/telegram/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://justlucy.ai').replace(/\/+$/, '');

async function requireAdmin(req: NextRequest): Promise<boolean> {
  const { userId } = await resolveMemoryAuth(req);
  return Boolean(userId && (await isAdminUser(userId)));
}

/** GET — current settings with secrets masked (booleans only). */
export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return Response.json({ error: 'forbidden' }, { status: 403 });
  const s = await loadTelegramSettings();
  return Response.json({
    configured: !!s,
    hasBotToken: !!s?.botToken,
    mode: s?.mode ?? 'shared',
    allowlist: s?.allowlist ?? [],
    sharedOwnerUserId: s?.sharedOwnerUserId ?? null,
    hasSharedKey: !!s?.sharedApiKey,
    defaultProvider: s?.defaultProvider ?? 'anthropic',
    defaultModel: s?.defaultModel ?? 'claude-sonnet-4-6',
    webhookRegistered: !!s?.webhookSecret,
    enabled: s?.enabled ?? false,
  });
}

/** POST — save settings, or ?action=register|unregister the webhook. */
export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) return Response.json({ error: 'forbidden' }, { status: 403 });
  const action = new URL(req.url).searchParams.get('action');
  const current = await loadTelegramSettings();

  if (action === 'register') {
    if (!current?.botToken) return Response.json({ error: 'Set a bot token first' }, { status: 400 });
    const secret = randomBytes(24).toString('hex');
    const url = `${SITE_URL}/api/channels/telegram`;
    const res = await fetch(`https://api.telegram.org/bot${current.botToken}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, secret_token: secret, allowed_updates: ['message'] }),
    });
    const tg = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
    if (!tg.ok) return Response.json({ error: tg.description ?? 'setWebhook failed' }, { status: 502 });
    await saveTelegramSettings({ webhookSecret: secret, enabled: true });
    return Response.json({ ok: true, url });
  }

  if (action === 'unregister') {
    if (current?.botToken) {
      await fetch(`https://api.telegram.org/bot${current.botToken}/deleteWebhook`, { method: 'POST' }).catch(() => {});
    }
    await saveTelegramSettings({ webhookSecret: null, enabled: false });
    return Response.json({ ok: true });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Parameters<typeof saveTelegramSettings>[0] = {};

  if (typeof body.botToken === 'string' && body.botToken) patch.botToken = body.botToken;
  if (body.mode === 'shared' || body.mode === 'linked') patch.mode = body.mode;
  if (Array.isArray(body.allowlist)) {
    patch.allowlist = body.allowlist.map((n) => Number(n)).filter((n) => Number.isFinite(n));
  }
  if (typeof body.defaultProvider === 'string') patch.defaultProvider = body.defaultProvider;
  if (typeof body.defaultModel === 'string') patch.defaultModel = body.defaultModel;

  // Shared mode: mint a Lucy API key for the owner account so the bot can call
  // /api/chat as that user (only when the owner changed or no key exists yet).
  if (typeof body.sharedOwnerUserId === 'string' && body.sharedOwnerUserId) {
    patch.sharedOwnerUserId = body.sharedOwnerUserId;
    if (body.sharedOwnerUserId !== current?.sharedOwnerUserId || !current?.sharedApiKey) {
      const minted = await createApiKey(body.sharedOwnerUserId, 'telegram-shared');
      if (minted) patch.sharedApiKey = minted.key;
    }
  }

  await saveTelegramSettings(patch);
  return Response.json({ ok: true });
}
