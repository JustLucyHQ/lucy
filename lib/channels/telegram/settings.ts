import { getServiceClient } from '@/lib/auth/admin';
import { encryptSecret, decryptSecret } from '@/lib/mcp/secret';

/**
 * Typed load/save for the single-row `lucy.telegram_settings`.
 * The bot token and the shared Lucy API key are stored AES-256-GCM encrypted
 * (via lib/mcp/secret) and returned decrypted to server callers only.
 */
export interface TelegramSettings {
  botToken: string | null;
  mode: 'shared' | 'linked';
  allowlist: number[];
  sharedOwnerUserId: string | null;
  sharedApiKey: string | null;
  defaultProvider: string;
  defaultModel: string;
  webhookSecret: string | null;
  enabled: boolean;
}

/** Patch shape accepted by saveTelegramSettings (plaintext secrets in). */
export interface TelegramSettingsPatch {
  botToken?: string | null;
  mode?: 'shared' | 'linked';
  allowlist?: number[];
  sharedOwnerUserId?: string | null;
  sharedApiKey?: string | null;
  defaultProvider?: string;
  defaultModel?: string;
  webhookSecret?: string | null;
  enabled?: boolean;
}

interface SettingsRow {
  bot_token_encrypted: string | null;
  mode: 'shared' | 'linked';
  allowlist: number[] | null;
  shared_owner_user_id: string | null;
  shared_api_key_encrypted: string | null;
  default_provider: string;
  default_model: string;
  webhook_secret: string | null;
  enabled: boolean;
}

/** Returns null when no service client is configured (standalone mode) or no row exists. */
export async function loadTelegramSettings(): Promise<TelegramSettings | null> {
  const client = getServiceClient();
  if (!client) return null;

  const { data } = await client
    .from('telegram_settings')
    .select(
      'bot_token_encrypted, mode, allowlist, shared_owner_user_id, shared_api_key_encrypted, default_provider, default_model, webhook_secret, enabled'
    )
    .eq('id', 1)
    .maybeSingle();

  if (!data) return null;
  const row = data as SettingsRow;

  return {
    botToken: row.bot_token_encrypted ? decryptSecret(row.bot_token_encrypted) : null,
    mode: row.mode,
    allowlist: row.allowlist ?? [],
    sharedOwnerUserId: row.shared_owner_user_id,
    sharedApiKey: row.shared_api_key_encrypted ? decryptSecret(row.shared_api_key_encrypted) : null,
    defaultProvider: row.default_provider,
    defaultModel: row.default_model,
    webhookSecret: row.webhook_secret,
    enabled: row.enabled,
  };
}

/** Upsert the singleton row. Secret fields are encrypted before write. */
export async function saveTelegramSettings(patch: TelegramSettingsPatch): Promise<void> {
  const client = getServiceClient();
  if (!client) throw new Error('Telegram settings require connected (Supabase) mode');

  const row: Record<string, unknown> = { id: 1, updated_at: new Date().toISOString() };
  if (patch.botToken !== undefined)
    row.bot_token_encrypted = patch.botToken ? encryptSecret(patch.botToken) : null;
  if (patch.sharedApiKey !== undefined)
    row.shared_api_key_encrypted = patch.sharedApiKey ? encryptSecret(patch.sharedApiKey) : null;
  if (patch.mode !== undefined) row.mode = patch.mode;
  if (patch.allowlist !== undefined) row.allowlist = patch.allowlist;
  if (patch.sharedOwnerUserId !== undefined) row.shared_owner_user_id = patch.sharedOwnerUserId;
  if (patch.defaultProvider !== undefined) row.default_provider = patch.defaultProvider;
  if (patch.defaultModel !== undefined) row.default_model = patch.defaultModel;
  if (patch.webhookSecret !== undefined) row.webhook_secret = patch.webhookSecret;
  if (patch.enabled !== undefined) row.enabled = patch.enabled;

  const { error } = await client.from('telegram_settings').upsert(row, { onConflict: 'id' });
  if (error) throw new Error(`Failed to save Telegram settings: ${error.message}`);
}
