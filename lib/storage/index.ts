/**
 * Storage abstraction layer.
 *
 * Both LocalStorageAdapter and SupabaseStorageAdapter implement this interface,
 * allowing the rest of the app to be storage-agnostic.
 */

import type { Theme } from '../theme';

export interface Conversation {
  id: string;
  title: string;
  model: string;
  provider: string;
  createdAt: number;
  updatedAt: number;
}

export interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model?: string;
  provider?: string;
  tokensUsed?: number;
  createdAt: number;
}

export interface UserPreferences {
  theme: Theme;
  defaultModel: string;
  defaultProvider: string;
  companyName?: string;
}

export interface ProviderConfig {
  provider: string;
  apiKey: string;
  isActive: boolean;
}

export interface StorageAdapter {
  // Conversations
  getConversations(): Promise<Conversation[]>;
  getConversation(id: string): Promise<Conversation | null>;
  createConversation(conv: Partial<Conversation>): Promise<Conversation>;
  updateConversation(id: string, data: Partial<Conversation>): Promise<void>;
  deleteConversation(id: string): Promise<void>;

  // Messages
  getMessages(conversationId: string): Promise<Message[]>;
  addMessage(conversationId: string, message: Partial<Message>): Promise<Message>;
  updateMessage(id: string, data: Partial<Message>): Promise<void>;

  // Preferences
  getPreferences(): Promise<UserPreferences>;
  updatePreferences(prefs: Partial<UserPreferences>): Promise<void>;

  // Provider API keys
  getProviderConfigs(): Promise<ProviderConfig[]>;
  setProviderConfig(provider: string, apiKey: string): Promise<void>;
  getProviderApiKey(provider: string): Promise<string | null>;
}
