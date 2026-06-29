'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface MemoryState {
  enabled: boolean; // admin gate (connected mode, loaded from memory_settings)
  localEnabled: boolean; // standalone gate (persisted in this browser)
  incognito: boolean; // per-session: skip capture
  lastUsedCount: number; // for the "🧠 used N" affordance
  setEnabled(v: boolean): void;
  setLocalEnabled(v: boolean): void;
  setIncognito(v: boolean): void;
  setLastUsedCount(n: number): void;
  /** Connected-mode header value: admin-enabled AND not incognito. */
  memoryHeader(): '0' | '1';
  /** Standalone-mode gate: locally-enabled AND not incognito. */
  localActive(): boolean;
}

export const useMemoryStore = create<MemoryState>()(
  persist(
    (set, get) => ({
      enabled: false,
      localEnabled: false,
      incognito: false,
      lastUsedCount: 0,
      setEnabled: (v) => set({ enabled: v }),
      setLocalEnabled: (v) => set({ localEnabled: v }),
      setIncognito: (v) => set({ incognito: v }),
      setLastUsedCount: (n) => set({ lastUsedCount: n }),
      memoryHeader: () => (get().enabled && !get().incognito ? '1' : '0'),
      localActive: () => get().localEnabled && !get().incognito,
    }),
    {
      name: 'lucy-memory-ui',
      // Only the standalone toggle persists; the admin gate comes from the server.
      partialize: (s) => ({ localEnabled: s.localEnabled }),
    }
  )
);
