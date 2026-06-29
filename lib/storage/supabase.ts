/**
 * Supabase storage adapter.
 *
 * Used in connected mode when NEXT_PUBLIC_SUPABASE_URL is configured.
 * All data is stored in PostgreSQL via Supabase in the 'lucy' schema.
 *
 * Provider API keys go through /api/provider-keys, which AES-256-GCM encrypts
 * them server-side (the browser never sees the encryption key). Legacy
 * XOR-obfuscated rows are migrated transparently on read.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  StorageAdapter,
  Conversation,
  Message,
  UserPreferences,
  ProviderConfig,
} from './index';
import { DEFAULT_THEME } from '../theme';
import type { Theme } from '../theme';

// ─── Default values ───────────────────────────────────────────────────────────

const DEFAULT_PREFERENCES: UserPreferences = {
  theme: DEFAULT_THEME,
  defaultModel: 'gpt-4o',
  defaultProvider: 'openai',
};

// ─── Adapter ─────────────────────────────────────────────────────────────────

export class SupabaseStorageAdapter implements StorageAdapter {
  private client: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  /** Returns the authenticated user's ID, or null for anonymous sessions. */
  private async getUserId(): Promise<string | null> {
    const {
      data: { user },
    } = await this.client.auth.getUser();
    return user?.id ?? null;
  }

  // ── Conversations ──────────────────────────────────────────────────────────

  async getConversations(): Promise<Conversation[]> {
    const { data, error } = await this.client
      .from('conversations')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('[SupabaseAdapter] getConversations error:', error.message);
      return [];
    }

    return (data ?? []).map(rowToConversation);
  }

  async getConversation(id: string): Promise<Conversation | null> {
    const { data, error } = await this.client
      .from('conversations')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) return null;
    return rowToConversation(data);
  }

  async createConversation(conv: Partial<Conversation>): Promise<Conversation> {
    const userId = await this.getUserId();

    const { data, error } = await this.client
      .from('conversations')
      .insert({
        user_id: userId,
        title: conv.title ?? 'New Conversation',
        model: conv.model ?? 'gpt-4o',
        provider: conv.provider ?? 'openai',
      })
      .select()
      .single();

    if (error || !data) {
      throw new Error(`[SupabaseAdapter] createConversation: ${error?.message}`);
    }

    return rowToConversation(data);
  }

  async updateConversation(id: string, data: Partial<Conversation>): Promise<void> {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.title !== undefined) patch.title = data.title;
    if (data.model !== undefined) patch.model = data.model;
    if (data.provider !== undefined) patch.provider = data.provider;

    const { error } = await this.client
      .from('conversations')
      .update(patch)
      .eq('id', id);

    if (error) {
      console.error('[SupabaseAdapter] updateConversation error:', error.message);
    }
  }

  async deleteConversation(id: string): Promise<void> {
    // Messages are deleted via ON DELETE CASCADE in the schema
    const { error } = await this.client
      .from('conversations')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[SupabaseAdapter] deleteConversation error:', error.message);
    }
  }

  // ── Messages ───────────────────────────────────────────────────────────────

  async getMessages(conversationId: string): Promise<Message[]> {
    const { data, error } = await this.client
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[SupabaseAdapter] getMessages error:', error.message);
      return [];
    }

    return (data ?? []).map(rowToMessage);
  }

  async addMessage(conversationId: string, msg: Partial<Message>): Promise<Message> {
    const { data, error } = await this.client
      .from('messages')
      .insert({
        conversation_id: conversationId,
        role: msg.role ?? 'user',
        content: msg.content ?? '',
        model: msg.model ?? null,
        provider: msg.provider ?? null,
        tokens_used: msg.tokensUsed ?? null,
      })
      .select()
      .single();

    if (error || !data) {
      throw new Error(`[SupabaseAdapter] addMessage: ${error?.message}`);
    }

    return rowToMessage(data);
  }

  async updateMessage(id: string, data: Partial<Message>): Promise<void> {
    const patch: Record<string, unknown> = {};
    if (data.content !== undefined) patch.content = data.content;
    if (data.tokensUsed !== undefined) patch.tokens_used = data.tokensUsed;

    const { error } = await this.client
      .from('messages')
      .update(patch)
      .eq('id', id);

    if (error) {
      console.error('[SupabaseAdapter] updateMessage error:', error.message);
    }
  }

  // ── Preferences ────────────────────────────────────────────────────────────

  async getPreferences(): Promise<UserPreferences> {
    const userId = await this.getUserId();
    if (!userId) return DEFAULT_PREFERENCES;

    const { data, error } = await this.client
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error || !data) return DEFAULT_PREFERENCES;

    return {
      theme: (data.theme as Theme) ?? DEFAULT_PREFERENCES.theme,
      defaultModel: data.default_model ?? 'gpt-4o',
      defaultProvider: data.default_provider ?? 'openai',
      companyName: data.company_name ?? undefined,
    };
  }

  async updatePreferences(prefs: Partial<UserPreferences>): Promise<void> {
    const userId = await this.getUserId();
    if (!userId) return;

    const patch: Record<string, unknown> = {
      user_id: userId,
      updated_at: new Date().toISOString(),
    };
    if (prefs.theme !== undefined) patch.theme = prefs.theme;
    if (prefs.defaultModel !== undefined) patch.default_model = prefs.defaultModel;
    if (prefs.defaultProvider !== undefined) patch.default_provider = prefs.defaultProvider;
    if (prefs.companyName !== undefined) patch.company_name = prefs.companyName;

    const { error } = await this.client
      .from('user_preferences')
      .upsert(patch, { onConflict: 'user_id' });

    if (error) {
      console.error('[SupabaseAdapter] updatePreferences error:', error.message);
    }
  }

  // ── Provider configs ───────────────────────────────────────────────────────

  async getProviderConfigs(): Promise<ProviderConfig[]> {
    try {
      const res = await fetch('/api/provider-keys');
      if (!res.ok) {
        console.error('[SupabaseAdapter] getProviderConfigs error:', res.status);
        return [];
      }
      const { configs } = (await res.json()) as { configs: ProviderConfig[] };
      return configs ?? [];
    } catch (err) {
      console.error('[SupabaseAdapter] getProviderConfigs error:', err);
      return [];
    }
  }

  async setProviderConfig(provider: string, apiKey: string): Promise<void> {
    try {
      const res = await fetch('/api/provider-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey }),
      });
      if (!res.ok) {
        console.error('[SupabaseAdapter] setProviderConfig error:', res.status);
      }
    } catch (err) {
      console.error('[SupabaseAdapter] setProviderConfig error:', err);
    }
  }

  async getProviderApiKey(provider: string): Promise<string | null> {
    const configs = await this.getProviderConfigs();
    const config = configs.find((c) => c.provider === provider && c.isActive);
    return config?.apiKey ?? null;
  }
}

// ─── Row mappers ──────────────────────────────────────────────────────────────

function rowToConversation(row: Record<string, unknown>): Conversation {
  return {
    id: row.id as string,
    title: (row.title as string) ?? 'New Conversation',
    model: (row.model as string) ?? 'gpt-4o',
    provider: (row.provider as string) ?? 'openai',
    createdAt: new Date(row.created_at as string).getTime(),
    updatedAt: new Date(row.updated_at as string).getTime(),
  };
}

function rowToMessage(row: Record<string, unknown>): Message {
  return {
    id: row.id as string,
    conversationId: row.conversation_id as string,
    role: row.role as 'user' | 'assistant' | 'system',
    content: row.content as string,
    model: (row.model as string | null) ?? undefined,
    provider: (row.provider as string | null) ?? undefined,
    tokensUsed: (row.tokens_used as number | null) ?? undefined,
    createdAt: new Date(row.created_at as string).getTime(),
  };
}
