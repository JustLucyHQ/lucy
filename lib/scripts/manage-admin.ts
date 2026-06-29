/**
 * Admin role management CLI (lucy_role in Supabase auth app_metadata).
 *
 * Usage (env from .env.local is loaded automatically):
 *   npx tsx lib/scripts/manage-admin.ts list
 *   npx tsx lib/scripts/manage-admin.ts grant you@company.com
 *   npx tsx lib/scripts/manage-admin.ts revoke someone@company.com
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Minimal .env.local loader (no dotenv dependency)
try {
  const env = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
} catch {
  /* no .env.local — rely on real env */
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  process.exit(1);
}
const svc = createClient(url, key);

async function main() {
  const [cmd, email] = process.argv.slice(2);
  const { data, error } = await svc.auth.admin.listUsers({ perPage: 1000 });
  if (error) { console.error('listUsers failed:', error.message); process.exit(1); }
  const users = data.users;

  if (cmd === 'list' || !cmd) {
    console.log(`${users.length} user(s):\n`);
    for (const u of users.sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''))) {
      const role = u.app_metadata?.lucy_role === 'admin' ? 'ADMIN' : 'member';
      console.log(`  ${role.padEnd(6)} ${u.email ?? '(no email)'}  created ${String(u.created_at).slice(0, 10)}  id=${u.id}`);
    }
    return;
  }

  if ((cmd === 'grant' || cmd === 'revoke') && email) {
    const target = users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (!target) { console.error(`No user with email ${email}`); process.exit(1); }
    const role = cmd === 'grant' ? 'admin' : 'member';
    const { error: err } = await svc.auth.admin.updateUserById(target.id, {
      app_metadata: { ...target.app_metadata, lucy_role: role },
    });
    if (err) { console.error('update failed:', err.message); process.exit(1); }
    console.log(`${email} → lucy_role=${role}`);
    return;
  }

  console.log('Usage: manage-admin.ts list | grant <email> | revoke <email>');
}

main();
