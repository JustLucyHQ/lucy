'use client';

/**
 * StoreSync — mounts inside <StorageProvider> and bootstraps the zustand stores
 * by loading persisted data through the active StorageAdapter.
 *
 * Re-runs whenever the authenticated user changes (sign-in / sign-out) so each
 * user sees only their own conversations, settings, and provider configs.
 */

import { useEffect, useRef } from 'react';
import { useStorage } from '../storage/provider';
import { useAuth } from '../supabase/auth';
import { isSupabaseEnabled } from '../supabase/client';
import { useConversationsStore } from './conversations';
import { useSettingsStore } from './settings';

export function StoreSync() {
  const adapter = useStorage();
  const { user, loading } = useAuth();
  const userId = user?.id ?? null;
  const prevUserId = useRef<string | null>(undefined as unknown as string | null);

  useEffect(() => {
    if (loading) return;

    // Standalone (desktop / local) mode has no auth user, so the per-user
    // guard below would skip bootstrap entirely and persisted settings +
    // provider keys would never re-hydrate on launch. Bootstrap once from the
    // user-agnostic local adapter instead.
    if (!isSupabaseEnabled()) {
      if (prevUserId.current === 'local') return;
      prevUserId.current = 'local';
      useSettingsStore.getState().loadSettings(adapter).catch((err) => {
        console.error('[StoreSync] Failed to load settings:', err);
      });
      useConversationsStore.getState().loadConversations(adapter).catch((err) => {
        console.error('[StoreSync] Failed to load conversations:', err);
      });
      return;
    }

    if (prevUserId.current === userId) return;
    prevUserId.current = userId;

    if (!userId) {
      useConversationsStore.setState({ conversations: [], activeConversationId: null });
      return;
    }

    useSettingsStore.getState().loadSettings(adapter).catch((err) => {
      console.error('[StoreSync] Failed to load settings:', err);
    });

    useConversationsStore.getState().loadConversations(adapter).catch((err) => {
      console.error('[StoreSync] Failed to load conversations:', err);
    });
  }, [adapter, userId, loading]);

  return null;
}
