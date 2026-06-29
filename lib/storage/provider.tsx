'use client';

/**
 * StorageProvider — React context that exposes the active StorageAdapter.
 *
 * Detects whether Supabase is configured at runtime:
 *   - Supabase env vars present  →  SupabaseStorageAdapter
 *   - No env vars (default)      →  LocalStorageAdapter
 *
 * The useStorage() hook returns the active adapter from anywhere in the tree.
 */

import React, { createContext, useContext, useMemo } from 'react';
import { isSupabaseEnabled, getSupabaseClient } from '../supabase/client';
import { LocalStorageAdapter } from './local';
import { SupabaseStorageAdapter } from './supabase';
import type { StorageAdapter } from './index';

const StorageContext = createContext<StorageAdapter | null>(null);

export function StorageProvider({ children }: { children: React.ReactNode }) {
  const adapter = useMemo<StorageAdapter>(() => {
    if (isSupabaseEnabled()) {
      const client = getSupabaseClient();
      // getSupabaseClient() returns non-null when isSupabaseEnabled() is true
      return new SupabaseStorageAdapter(client!);
    }
    return new LocalStorageAdapter();
  }, []);

  return (
    <StorageContext.Provider value={adapter}>
      {children}
    </StorageContext.Provider>
  );
}

/**
 * Returns the active StorageAdapter.
 * Must be called inside a <StorageProvider>.
 */
export function useStorage(): StorageAdapter {
  const adapter = useContext(StorageContext);
  if (!adapter) {
    throw new Error('useStorage() must be called within a <StorageProvider>');
  }
  return adapter;
}

/**
 * Returns the current storage mode for display purposes.
 */
export function useStorageMode(): 'supabase' | 'local' {
  return isSupabaseEnabled() ? 'supabase' : 'local';
}
