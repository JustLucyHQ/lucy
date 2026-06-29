/**
 * LocalStorage storage adapter.
 *
 * Used in standalone mode (no Supabase configured).
 * Data is kept in browser localStorage under the 'lucy-' namespace.
 */

import type {
  StorageAdapter,
  Conversation,
  Message,
  UserPreferences,
  ProviderConfig,
} from './index';
import { DEFAULT_THEME } from '../theme';

// ─── localStorage key constants ──────────────────────────────────────────────
const CONVERSATIONS_KEY = 'lucy-conversations';
const MESSAGES_KEY = 'lucy-messages';
const PREFERENCES_KEY = 'lucy-preferences';
const PROVIDER_CONFIGS_KEY = 'lucy-provider-configs';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJSON<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    console.error(`[LocalStorageAdapter] Failed to write key "${key}"`);
  }
}

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Default values ───────────────────────────────────────────────────────────

const DEFAULT_PREFERENCES: UserPreferences = {
  theme: DEFAULT_THEME,
  defaultModel: 'gpt-4o',
  defaultProvider: 'openai',
};

// ─── Adapter ─────────────────────────────────────────────────────────────────

export class LocalStorageAdapter implements StorageAdapter {
  // ── Conversations ──────────────────────────────────────────────────────────

  async getConversations(): Promise<Conversation[]> {
    return readJSON<Conversation[]>(CONVERSATIONS_KEY, []);
  }

  async getConversation(id: string): Promise<Conversation | null> {
    const all = await this.getConversations();
    return all.find((c) => c.id === id) ?? null;
  }

  async createConversation(data: Partial<Conversation>): Promise<Conversation> {
    const now = Date.now();
    const conv: Conversation = {
      id: `conv_${generateId()}`,
      title: data.title ?? 'New Conversation',
      model: data.model ?? 'gpt-4o',
      provider: data.provider ?? 'openai',
      createdAt: data.createdAt ?? now,
      updatedAt: data.updatedAt ?? now,
    };
    const all = await this.getConversations();
    writeJSON(CONVERSATIONS_KEY, [conv, ...all]);
    return conv;
  }

  async updateConversation(id: string, data: Partial<Conversation>): Promise<void> {
    const all = await this.getConversations();
    const updated = all.map((c) =>
      c.id === id ? { ...c, ...data, updatedAt: Date.now() } : c
    );
    writeJSON(CONVERSATIONS_KEY, updated);
  }

  async deleteConversation(id: string): Promise<void> {
    const all = await this.getConversations();
    writeJSON(
      CONVERSATIONS_KEY,
      all.filter((c) => c.id !== id)
    );

    // Also remove associated messages
    const messages = readJSON<Message[]>(MESSAGES_KEY, []);
    writeJSON(
      MESSAGES_KEY,
      messages.filter((m) => m.conversationId !== id)
    );
  }

  // ── Messages ───────────────────────────────────────────────────────────────

  async getMessages(conversationId: string): Promise<Message[]> {
    const all = readJSON<Message[]>(MESSAGES_KEY, []);
    return all.filter((m) => m.conversationId === conversationId);
  }

  async addMessage(conversationId: string, data: Partial<Message>): Promise<Message> {
    const message: Message = {
      id: `msg_${generateId()}`,
      conversationId,
      role: data.role ?? 'user',
      content: data.content ?? '',
      model: data.model,
      provider: data.provider,
      tokensUsed: data.tokensUsed,
      createdAt: data.createdAt ?? Date.now(),
    };
    const all = readJSON<Message[]>(MESSAGES_KEY, []);
    writeJSON(MESSAGES_KEY, [...all, message]);
    return message;
  }

  async updateMessage(id: string, data: Partial<Message>): Promise<void> {
    const all = readJSON<Message[]>(MESSAGES_KEY, []);
    const updated = all.map((m) => (m.id === id ? { ...m, ...data } : m));
    writeJSON(MESSAGES_KEY, updated);
  }

  // ── Preferences ────────────────────────────────────────────────────────────

  async getPreferences(): Promise<UserPreferences> {
    return readJSON<UserPreferences>(PREFERENCES_KEY, DEFAULT_PREFERENCES);
  }

  async updatePreferences(prefs: Partial<UserPreferences>): Promise<void> {
    const current = await this.getPreferences();
    writeJSON(PREFERENCES_KEY, { ...current, ...prefs });
  }

  // ── Provider configs ───────────────────────────────────────────────────────

  async getProviderConfigs(): Promise<ProviderConfig[]> {
    return readJSON<ProviderConfig[]>(PROVIDER_CONFIGS_KEY, []);
  }

  async setProviderConfig(provider: string, apiKey: string): Promise<void> {
    const all = await this.getProviderConfigs();
    const existing = all.findIndex((c) => c.provider === provider);
    const config: ProviderConfig = { provider, apiKey, isActive: true };

    if (existing >= 0) {
      all[existing] = config;
    } else {
      all.push(config);
    }

    writeJSON(PROVIDER_CONFIGS_KEY, all);
  }

  async getProviderApiKey(provider: string): Promise<string | null> {
    const all = await this.getProviderConfigs();
    const config = all.find((c) => c.provider === provider && c.isActive);
    return config?.apiKey ?? null;
  }
}
