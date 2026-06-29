import { getServiceClient } from '@/lib/auth/admin';
import { decryptSecret } from '@/lib/mcp/secret';
import type { TelegramSettings } from './settings';

/**
 * Map an incoming Telegram user to a Lucy account + that user's Lucy API key.
 * - shared mode: everyone resolves to the configured owner account (gated by an
 *   optional allowlist).
 * - linked mode: look up the per-user binding from telegram_links.
 */
export type ResolvedUser =
  | { kind: 'ok'; lucyUserId: string; apiKey: string }
  | { kind: 'unauthorized' }
  | { kind: 'needsLink' };

export async function resolveTelegramUser(
  fromId: number,
  settings: TelegramSettings
): Promise<ResolvedUser> {
  if (settings.mode === 'shared') {
    if (settings.allowlist.length > 0 && !settings.allowlist.includes(fromId)) {
      return { kind: 'unauthorized' };
    }
    if (!settings.sharedOwnerUserId || !settings.sharedApiKey) {
      return { kind: 'unauthorized' };
    }
    return { kind: 'ok', lucyUserId: settings.sharedOwnerUserId, apiKey: settings.sharedApiKey };
  }

  // linked mode
  const client = getServiceClient();
  if (!client) return { kind: 'needsLink' };

  const { data } = await client
    .from('telegram_links')
    .select('lucy_user_id, api_key_encrypted')
    .eq('telegram_user_id', fromId)
    .maybeSingle();

  if (!data) return { kind: 'needsLink' };
  const apiKey = decryptSecret(data.api_key_encrypted as string);
  if (!apiKey) return { kind: 'needsLink' };
  return { kind: 'ok', lucyUserId: data.lucy_user_id as string, apiKey };
}
