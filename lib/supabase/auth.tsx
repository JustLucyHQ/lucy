'use client';

/**
 * Auth context for Supabase connected mode.
 *
 * - If Supabase is configured: manages sign-in / sign-up / sign-out via Supabase Auth.
 * - If standalone (no env vars): skips auth entirely; user is always "anonymous".
 *
 * Components can call useAuth() to get the current session and auth helpers.
 */

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { getSupabaseClient, isSupabaseEnabled } from './client';
import { clear2faPassed } from '@/lib/auth/twofa-session';
import { trackDevice } from '@/lib/auth/device';

interface AuthState {
  /** The current Supabase session, or null if not signed in / standalone mode. */
  session: Session | null;
  /** The current user, or null if not signed in / standalone mode. */
  user: User | null;
  /** True while the initial session is being loaded. */
  loading: boolean;
  /** True when Supabase auth is active (env vars configured). */
  authEnabled: boolean;
  /** Sign in with email + password. No-op in standalone mode. */
  signIn(email: string, password: string): Promise<{ error: string | null }>;
  /** Sign up with email + password and optional metadata. No-op in standalone mode. */
  signUp(
    email: string,
    password: string,
    metadata?: { company?: string; display_name?: string }
  ): Promise<{ error: string | null }>;
  /** Sign out. No-op in standalone mode. */
  signOut(): Promise<void>;
  /** Sign in with Google OAuth. No-op in standalone mode. */
  signInWithGoogle(): Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  // Standalone mode has no session to load, so it starts non-loading —
  // avoids a sync setState in the effect below.
  const [loading, setLoading] = useState(() => isSupabaseEnabled());
  const authEnabled = isSupabaseEnabled();
  const client = getSupabaseClient();
  // Guard: track device only once per unique user id per session, not on every token refresh.
  const trackedUserRef = useRef<string | null>(null);

  useEffect(() => {
    if (!authEnabled || !client) return;

    // Load existing session
    client.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      // Track device once per sign-in (not on TOKEN_REFRESHED or repeated SIGNED_IN for the same user).
      if (event === 'SIGNED_IN' && newSession?.user?.id && newSession.user.id !== trackedUserRef.current) {
        trackedUserRef.current = newSession.user.id;
        trackDevice(); // fire-and-forget
      }
    });

    return () => subscription.unsubscribe();
  }, [authEnabled, client]);

  const signIn = async (email: string, password: string) => {
    if (!client) return { error: null };
    const { error } = await client.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signUp = async (
    email: string,
    password: string,
    metadata?: { company?: string; display_name?: string }
  ) => {
    if (!client) return { error: null };
    const { error, data } = await client.auth.signUp({
      email,
      password,
      options: {
        data: metadata ?? {},
        // The Supabase project's GOTRUE_SITE_URL defaults to a different
        // product on this shared instance — without this, the confirmation
        // link would land users on the wrong site after they confirm.
        emailRedirectTo: typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : undefined,
      },
    });
    // Always create the profile row up front (not just when company is given) —
    // this is what lets the email-verification gate tell "brand-new unconfirmed
    // signup" apart from "legacy account with no row" (which the migration
    // backfills as verified). Best-effort: sign-up already succeeded either way.
    if (!error && data.user) {
      await client
        .from('user_profiles')
        .upsert(
          {
            user_id: data.user.id,
            email_verified: false,
            ...(metadata?.company ? { company: metadata.company } : {}),
            ...(metadata?.display_name ? { display_name: metadata.display_name } : {}),
          },
          { onConflict: 'user_id' }
        );
      // Send the confirmation code (best-effort — the /auth/confirm-email page
      // also requests one itself on mount, so a failure here isn't fatal).
      try {
        await fetch('/api/auth/signup/request', { method: 'POST' });
      } catch {
        // ignore — the confirm-email page will retry
      }
    }
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    if (!client) return;
    clear2faPassed();
    await client.auth.signOut();
  };

  const signInWithGoogle = async () => {
    if (!client) return { error: null };
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    return { error: error?.message ?? null };
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        authEnabled,
        signIn,
        signUp,
        signOut,
        signInWithGoogle,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth() must be called within an <AuthProvider>');
  }
  return ctx;
}
