'use client';
import { useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/supabase/auth';

/**
 * Header call-to-action: shows "Sign in" for signed-out visitors and "Open app"
 * once the user is logged in. The hydration flag (server → false, client → true
 * via useSyncExternalStore) keeps the first render signed-out so server and
 * client markup match.
 */
const subscribe = () => () => {};

export function NavCta() {
  const { user } = useAuth();
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  const loggedIn = hydrated && Boolean(user);

  return (
    <Link
      href={loggedIn ? '/chat' : '/auth/login'}
      className="text-sm font-semibold text-white bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.1] rounded-full px-4 py-2 transition-colors"
    >
      {loggedIn ? 'Open app' : 'Sign in'}
    </Link>
  );
}
