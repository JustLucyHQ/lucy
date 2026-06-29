'use client';

/**
 * Settings zustand store.
 *
 * In-memory state drives the UI (fast, synchronous reads).
 * All mutations write through to the active StorageAdapter for persistence.
 */

import { create } from 'zustand';
import type { StorageAdapter, UserPreferences } from '../storage';
import type { VoiceConfig } from '../voice/types';
import type { Theme as ThemeType } from '../theme';
import { markOnboarded } from '../onboarding';

const OLLAMA_DEFAULT_URL = 'http://localhost:11434';
const LM_STUDIO_DEFAULT_URL = 'http://localhost:1234';

const VOICE_STORAGE_KEY = 'lucy:voice';

const DEFAULT_VOICE_CONFIG: VoiceConfig = {
  stt: { enabled: false, provider: 'browser', language: 'en-US' },
  tts: { enabled: false, provider: 'browser', voice: 'default', speed: 1, autoRead: false },
};

function loadVoiceConfig(): VoiceConfig {
  if (typeof window === 'undefined') return DEFAULT_VOICE_CONFIG;
  try {
    const raw = localStorage.getItem(VOICE_STORAGE_KEY);
    if (!raw) return DEFAULT_VOICE_CONFIG;
    const parsed = JSON.parse(raw) as Partial<VoiceConfig>;
    return {
      stt: { ...DEFAULT_VOICE_CONFIG.stt, ...parsed.stt },
      tts: { ...DEFAULT_VOICE_CONFIG.tts, ...parsed.tts },
      deepgramKey: parsed.deepgramKey,
    };
  } catch {
    return DEFAULT_VOICE_CONFIG;
  }
}

function saveVoiceConfig(cfg: VoiceConfig): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(VOICE_STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    /* non-fatal */
  }
}

export type { UserPreferences };
export type { VoiceConfig } from '../voice/types';
export type Theme = ThemeType;

// ─── Types ────────────────────────────────────────────────────────────────────

/** Flat API-key map used throughout the UI. */
export interface ApiKeys {
  openai: string;
  anthropic: string;
  google: string;
  deepseek: string;
  groq: string;
  mistral: string;
  xai: string;
  openrouter: string;
}

interface SettingsState {
  apiKeys: ApiKeys;
  theme: Theme;
  defaultModel: string;
  defaultProvider: string;

  /** True once loadSettings has hydrated persisted data from the adapter. */
  loaded: boolean;

  /** URL for the local Ollama server (default: http://localhost:11434). */
  ollamaUrl: string;
  /** URL for the local LM Studio server (default: http://localhost:1234). */
  lmStudioUrl: string;

  /** Persisted voice configuration (STT + TTS). Stored in localStorage. */
  voice: VoiceConfig;

  // Bootstrap — called once by <StoreSync> after the adapter is ready
  loadSettings(adapter: StorageAdapter): Promise<void>;

  // Mutations
  setApiKey(provider: keyof ApiKeys, key: string, adapter: StorageAdapter): Promise<void>;
  setTheme(theme: Theme, adapter: StorageAdapter): Promise<void>;
  setDefaultModel(model: string, adapter: StorageAdapter): Promise<void>;
  /** Persists the default provider (used to power chat on next launch). */
  setDefaultProvider(provider: string, adapter: StorageAdapter): Promise<void>;
  /** Updates the Ollama URL in the store (persisted to localStorage/prefs). */
  setOllamaUrl(url: string): void;
  /** Updates the LM Studio URL in the store (persisted to localStorage/prefs). */
  setLmStudioUrl(url: string): void;
  hasApiKey(provider: keyof ApiKeys): boolean;
  getApiKey(provider: keyof ApiKeys): string;

  /** Deep-merge a partial VoiceConfig into the voice slice and persist. */
  setVoice(patch: Partial<VoiceConfig>): void;
  /** Patch only the stt sub-object. */
  setVoiceStt(patch: Partial<VoiceConfig['stt']>): void;
  /** Patch only the tts sub-object. */
  setVoiceTts(patch: Partial<VoiceConfig['tts']>): void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  apiKeys: { openai: '', anthropic: '', google: '', deepseek: '', groq: '', mistral: '', xai: '', openrouter: '' },
  theme: 'luminous' as Theme,
  defaultModel: 'gpt-4o',
  defaultProvider: 'openai',
  loaded: false,
  ollamaUrl: OLLAMA_DEFAULT_URL,
  lmStudioUrl: LM_STUDIO_DEFAULT_URL,
  voice: DEFAULT_VOICE_CONFIG, // overwritten on client by loadSettings or lazy-init

  // ── Bootstrap ────────────────────────────────────────────────────────────

  async loadSettings(adapter) {
    const [prefs, configs] = await Promise.all([
      adapter.getPreferences(),
      adapter.getProviderConfigs(),
    ]);

    // Build apiKeys map from stored configs
    const apiKeys: ApiKeys = { openai: '', anthropic: '', google: '', deepseek: '', groq: '', mistral: '', xai: '', openrouter: '' };
    for (const config of configs) {
      if (config.provider in apiKeys) {
        apiKeys[config.provider as keyof ApiKeys] = config.apiKey;
      }
    }

    set({
      apiKeys,
      theme: prefs.theme,
      defaultModel: prefs.defaultModel,
      defaultProvider: prefs.defaultProvider,
      // Hydrate voice config from localStorage on first load.
      voice: loadVoiceConfig(),
      loaded: true,
    });

    // A user who already has a provider key configured has effectively been
    // through setup — don't bounce them into the first-run wizard.
    if (Object.values(apiKeys).some(Boolean)) markOnboarded();
  },

  // ── Mutations ─────────────────────────────────────────────────────────────

  async setApiKey(provider, key, adapter) {
    await adapter.setProviderConfig(provider, key);
    set((state) => ({
      apiKeys: { ...state.apiKeys, [provider]: key },
    }));
    // Configuring a provider key counts as completing first-run setup.
    if (key) markOnboarded();
  },

  async setTheme(theme, adapter) {
    // Optimistic: apply immediately so switching never waits on (or is
    // blocked by) the persistence write.
    set({ theme });
    try {
      await adapter.updatePreferences({ theme });
    } catch {
      // Persistence is best-effort; the theme is already applied locally
    }
  },

  async setDefaultModel(model, adapter) {
    await adapter.updatePreferences({ defaultModel: model });
    set({ defaultModel: model });
  },

  async setDefaultProvider(provider, adapter) {
    await adapter.updatePreferences({ defaultProvider: provider });
    set({ defaultProvider: provider });
  },

  setOllamaUrl(url) {
    set({ ollamaUrl: url || OLLAMA_DEFAULT_URL });
  },

  setLmStudioUrl(url) {
    set({ lmStudioUrl: url || LM_STUDIO_DEFAULT_URL });
  },

  hasApiKey(provider) {
    return Boolean(get().apiKeys[provider]);
  },

  getApiKey(provider) {
    return get().apiKeys[provider] || '';
  },

  setVoice(patch) {
    const current = get().voice;
    const next: VoiceConfig = {
      stt: patch.stt ? { ...current.stt, ...patch.stt } : current.stt,
      tts: patch.tts ? { ...current.tts, ...patch.tts } : current.tts,
      deepgramKey: 'deepgramKey' in patch ? patch.deepgramKey : current.deepgramKey,
    };
    saveVoiceConfig(next);
    set({ voice: next });
  },

  setVoiceStt(patch) {
    const current = get().voice;
    const next: VoiceConfig = {
      ...current,
      stt: { ...current.stt, ...patch },
    };
    saveVoiceConfig(next);
    set({ voice: next });
  },

  setVoiceTts(patch) {
    const current = get().voice;
    const next: VoiceConfig = {
      ...current,
      tts: { ...current.tts, ...patch },
    };
    saveVoiceConfig(next);
    set({ voice: next });
  },
}));
