/**
 * API Key authentication for Lucy.
 *
 * Keys are generated as "lucy_k_<random>" and stored as SHA-256 hashes.
 * External apps (e.g. Contractors Room) send the key in the Authorization header.
 * The key maps to a user_id, so Lucy knows who owns the request.
 */

import { createHash, randomBytes } from 'crypto';
import { createClient } from '@supabase/supabase-js';

const KEY_PREFIX = 'lucy_k_';

function getServiceClient() {
  const url = (process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { db: { schema: 'lucy' } });
}

export function hashKey(plainKey: string): string {
  return createHash('sha256').update(plainKey).digest('hex');
}

export function generateKey(): { key: string; hash: string; prefix: string } {
  const random = randomBytes(24).toString('base64url');
  const key = `${KEY_PREFIX}${random}`;
  const hash = hashKey(key);
  const prefix = key.slice(0, 12);
  return { key, hash, prefix };
}

/**
 * Validates an API key from the Authorization header.
 * Returns the user_id if valid, null otherwise.
 */
export async function validateApiKey(authHeader: string | null): Promise<string | null> {
  if (!authHeader) return null;

  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token || !token.startsWith(KEY_PREFIX)) return null;

  const supabase = getServiceClient();
  if (!supabase) return null;

  const hash = hashKey(token);

  const { data } = await supabase
    .from('api_keys')
    .select('user_id, is_active')
    .eq('key_hash', hash)
    .single();

  if (!data || !data.is_active) return null;

  // Update last_used_at (fire and forget)
  supabase
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('key_hash', hash)
    .then(() => {});

  return data.user_id;
}

/**
 * Creates a new API key for a user.
 * Returns the full key (only shown once) and the stored record.
 */
export async function createApiKey(
  userId: string,
  name: string = 'Default'
): Promise<{ key: string; id: string; prefix: string } | null> {
  const supabase = getServiceClient();
  if (!supabase) return null;

  const { key, hash, prefix } = generateKey();

  const { data, error } = await supabase
    .from('api_keys')
    .insert({ user_id: userId, key_hash: hash, key_prefix: prefix, name })
    .select('id, key_prefix')
    .single();

  if (error || !data) return null;

  return { key, id: data.id, prefix: data.key_prefix };
}

/**
 * Lists API keys for a user (only shows prefix, never the full key).
 */
export async function listApiKeys(userId: string) {
  const supabase = getServiceClient();
  if (!supabase) return [];

  const { data } = await supabase
    .from('api_keys')
    .select('id, key_prefix, name, is_active, created_at, last_used_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  return data || [];
}

/**
 * Revokes (deactivates) an API key.
 */
export async function revokeApiKey(userId: string, keyId: string): Promise<boolean> {
  const supabase = getServiceClient();
  if (!supabase) return false;

  const { error } = await supabase
    .from('api_keys')
    .update({ is_active: false })
    .eq('id', keyId)
    .eq('user_id', userId);

  return !error;
}

/**
 * Deletes an API key permanently.
 */
export async function deleteApiKey(userId: string, keyId: string): Promise<boolean> {
  const supabase = getServiceClient();
  if (!supabase) return false;

  const { error } = await supabase
    .from('api_keys')
    .delete()
    .eq('id', keyId)
    .eq('user_id', userId);

  return !error;
}
