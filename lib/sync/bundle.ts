/**
 * Local → cloud sync bundle.
 *
 * Gathers a desktop (standalone) user's local data into a single payload that
 * the cloud `/api/sync/push` endpoint can upsert into their account. Pure and
 * adapter-driven so it works against any StorageAdapter and is easy to test.
 */

import type { StorageAdapter } from '../storage';

export interface SyncMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model?: string;
  provider?: string;
  tokensUsed?: number;
  createdAt: number;
}

export interface SyncConversation {
  id: string;
  title: string;
  model: string;
  provider: string;
  createdAt: number;
  updatedAt: number;
  messages: SyncMessage[];
}

export interface SyncBundle {
  conversations: SyncConversation[];
  preferences?: {
    theme?: string;
    defaultModel?: string;
    defaultProvider?: string;
    companyName?: string;
  };
  providerKeys?: { provider: string; apiKey: string }[];
}

export interface BuildBundleOptions {
  /** Include plaintext provider API keys in the bundle (opt-in). Default false. */
  includeProviderKeys?: boolean;
}

/** Reads the full local dataset from an adapter into a SyncBundle. */
export async function buildLocalBundle(
  adapter: StorageAdapter,
  options: BuildBundleOptions = {}
): Promise<SyncBundle> {
  const conversations = await adapter.getConversations();

  const withMessages: SyncConversation[] = await Promise.all(
    conversations.map(async (c) => {
      const messages = await adapter.getMessages(c.id);
      return {
        id: c.id,
        title: c.title,
        model: c.model,
        provider: c.provider,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        messages: messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          model: m.model,
          provider: m.provider,
          tokensUsed: m.tokensUsed,
          createdAt: m.createdAt,
        })),
      };
    })
  );

  const prefs = await adapter.getPreferences();
  const bundle: SyncBundle = {
    conversations: withMessages,
    preferences: {
      theme: prefs.theme,
      defaultModel: prefs.defaultModel,
      defaultProvider: prefs.defaultProvider,
      companyName: prefs.companyName,
    },
  };

  if (options.includeProviderKeys) {
    const configs = await adapter.getProviderConfigs();
    bundle.providerKeys = configs
      .filter((c) => c.apiKey)
      .map((c) => ({ provider: c.provider, apiKey: c.apiKey }));
  }

  return bundle;
}

/** Totals for UI feedback ("Synced N chats · M messages"). */
export function bundleCounts(bundle: SyncBundle): { conversations: number; messages: number } {
  return {
    conversations: bundle.conversations.length,
    messages: bundle.conversations.reduce((n, c) => n + c.messages.length, 0),
  };
}
