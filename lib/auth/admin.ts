import { createClient } from '@supabase/supabase-js';

// Matches the service-client idiom used by lib/screening — the lucy schema
// generic otherwise conflicts with the default "public" SupabaseClient type.
type ServiceClient = import('@supabase/supabase-js').SupabaseClient<any, any, any>;

/**
 * Role-based admin gate backed by Supabase auth `app_metadata`.
 *
 * The admin flag lives at auth.users.app_metadata.lucy_role ('admin'|'member').
 * app_metadata is writable ONLY via the service-role admin API — users can
 * never modify it themselves (unlike user_metadata). The key is namespaced
 * `lucy_role` because the Supabase instance is shared with Contractors Room.
 *
 * Bootstrap: when no account has lucy_role='admin' yet (fresh deployment),
 * one deterministic account is auto-promoted — a LUCY_ADMIN_EMAIL match if
 * that legacy env var is still set, otherwise the oldest registered account
 * (the deployer). No table, no migration, no env var required.
 */

export type AuthUserLite = {
  id: string;
  email?: string | null;
  created_at?: string;
  app_metadata?: Record<string, unknown>;
};

export const LUCY_ROLE_KEY = 'lucy_role';

export function getServiceClient(): ServiceClient | null {
  const url = (process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { db: { schema: 'lucy' } });
}

export function roleOf(user: AuthUserLite | null | undefined): 'admin' | 'member' {
  return user?.app_metadata?.[LUCY_ROLE_KEY] === 'admin' ? 'admin' : 'member';
}

/** Pure: is this email explicitly named in the LUCY_ADMIN_EMAIL bootstrap list? */
export function isEnvAdmin(email: string | null | undefined, envEmails: string | undefined): boolean {
  if (!email) return false;
  const list = (envEmails ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}

export async function setUserRole(
  client: ServiceClient,
  userId: string,
  role: 'admin' | 'member'
): Promise<boolean> {
  const { data: current } = await client.auth.admin.getUserById(userId);
  const existingMeta = (current?.user?.app_metadata as Record<string, unknown>) ?? {};
  const { error } = await client.auth.admin.updateUserById(userId, {
    app_metadata: { ...existingMeta, [LUCY_ROLE_KEY]: role },
  });
  return !error;
}

export async function listUsersWithRoles(client: ServiceClient): Promise<AuthUserLite[]> {
  const { data } = await client.auth.admin.listUsers({ perPage: 1000 });
  return (data?.users ?? []) as AuthUserLite[];
}

export async function isAdminUser(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const client = getServiceClient();
  if (!client) return false;

  try {
    const { data } = await client.auth.admin.getUserById(userId);
    const me = data?.user as AuthUserLite | undefined;
    if (roleOf(me) === 'admin') return true;

    // Bootstrap A — explicit operator intent: emails named in LUCY_ADMIN_EMAIL
    // are always admins. Doesn't depend on listUsers (which can fail on some
    // self-hosted GoTrue versions) and works in shared auth instances.
    if (isEnvAdmin(me?.email, process.env.LUCY_ADMIN_EMAIL)) {
      await setUserRole(client, userId, 'admin');
      return true;
    }

    // Bootstrap B — first claimer: when NO admin exists anywhere yet, the
    // current (authenticated) user becomes admin. The previous oldest-account
    // rule breaks on shared auth instances where the oldest user belongs to a
    // different app entirely.
    try {
      const users = await listUsersWithRoles(client);
      if (users.length > 0 && !users.some((u) => roleOf(u) === 'admin')) {
        await setUserRole(client, userId, 'admin');
        return true;
      }
    } catch {
      // listUsers unavailable — no first-claimer bootstrap; env list (above)
      // and pre-granted roles still work.
    }
    return false;
  } catch {
    return false;
  }
}
