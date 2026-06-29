/**
 * Seed an API key for admin@contractorsroom.com.
 *
 * Usage: npx tsx lib/scripts/seed-admin-key.ts
 *
 * Outputs the full API key to stdout (store it in CR's .env.local as LUCY_API_KEY).
 * The key is hashed and stored in lucy.api_keys.
 */

import { createClient } from '@supabase/supabase-js';
import { createHash, randomBytes } from 'crypto';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:8000';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SERVICE_KEY) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const ADMIN_EMAIL = 'admin@contractorsroom.com';
const KEY_PREFIX = 'lucy_k_';

async function main() {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    db: { schema: 'lucy' },
  });

  // Find the admin user
  const authClient = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: { users }, error: listErr } = await authClient.auth.admin.listUsers();

  if (listErr) {
    console.error('Failed to list users:', listErr.message);
    process.exit(1);
  }

  const admin = users?.find((u) => u.email === ADMIN_EMAIL);
  if (!admin) {
    console.error(`User ${ADMIN_EMAIL} not found in auth.users`);
    process.exit(1);
  }

  // Generate a key
  const random = randomBytes(24).toString('base64url');
  const fullKey = `${KEY_PREFIX}${random}`;
  const keyHash = createHash('sha256').update(fullKey).digest('hex');
  const keyPrefix = fullKey.slice(0, 12);

  // Check if active key already exists
  const { data: existing } = await supabase
    .from('api_keys')
    .select('id')
    .eq('user_id', admin.id)
    .eq('is_active', true)
    .limit(1);

  if (existing && existing.length > 0) {
    console.log('Active key already exists for admin. Creating a new one (old keys remain valid).');
  }

  const { error: insertErr } = await supabase.from('api_keys').insert({
    user_id: admin.id,
    key_hash: keyHash,
    key_prefix: keyPrefix,
    name: 'Contractors Room',
  });

  if (insertErr) {
    console.error('Failed to insert key:', insertErr.message);
    process.exit(1);
  }

  console.log('\n=== Lucy API Key for Contractors Room ===');
  console.log(`Key: ${fullKey}`);
  console.log(`Prefix: ${keyPrefix}...`);
  console.log(`User: ${ADMIN_EMAIL} (${admin.id})`);
  console.log('\nAdd to contractors-room/App/.env.local:');
  console.log(`LUCY_API_KEY=${fullKey}`);
  console.log('\nThis key will not be shown again.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
