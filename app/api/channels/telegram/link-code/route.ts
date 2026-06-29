import type { NextRequest } from 'next/server';
import { randomBytes } from 'crypto';
import { resolveMemoryAuth } from '@/lib/memory/auth';
import { getServiceClient } from '@/lib/auth/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TTL_SECONDS = 600; // 10 minutes

/**
 * POST — issue a short-lived code the signed-in user sends to the bot as
 * `/link <code>` to bind their Telegram account (linked mode).
 */
export async function POST(req: NextRequest) {
  const { userId } = await resolveMemoryAuth(req);
  if (!userId) return Response.json({ error: 'unauthenticated' }, { status: 401 });

  const client = getServiceClient();
  if (!client) return Response.json({ error: 'unavailable' }, { status: 503 });

  const code = randomBytes(4).toString('hex').toUpperCase(); // 8-char code
  const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000).toISOString();

  const { error } = await client
    .from('telegram_link_codes')
    .insert({ code, lucy_user_id: userId, expires_at: expiresAt });

  if (error) return Response.json({ error: 'Could not create a link code' }, { status: 500 });
  return Response.json({ code, expiresInSeconds: TTL_SECONDS });
}
