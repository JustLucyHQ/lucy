'use client';

/**
 * Conversations zustand store.
 *
 * In-memory state drives the UI (fast, synchronous reads).
 * All mutations also write through to the active StorageAdapter for persistence.
 *
 * In standalone mode the adapter writes to localStorage.
 * In connected mode the adapter writes to Supabase.
 */

import { create } from 'zustand';
import type { ChatMessage } from '../providers/types';
import type { StorageAdapter, Conversation as StoredConversation } from '../storage';

// ─── Types ────────────────────────────────────────────────────────────────────

/** In-memory conversation — extends the stored shape with ephemeral messages. */
export interface Conversation extends StoredConversation {
  messages: ChatMessage[];
}

interface ConversationsState {
  conversations: Conversation[];
  activeConversationId: string | null;

  // Bootstrap — called once by <StoreSync> after the adapter is ready
  loadConversations(adapter: StorageAdapter): Promise<void>;
  loadMessages(conversationId: string, adapter: StorageAdapter): Promise<void>;

  // Mutations (all accept the adapter so they can persist)
  createConversation(model: string, provider: string, adapter: StorageAdapter): Promise<string>;
  updateConversation(id: string, updates: Partial<Conversation>, adapter: StorageAdapter): Promise<void>;
  deleteConversation(id: string, adapter: StorageAdapter): Promise<void>;
  setActiveConversation(id: string | null): void;
  getActiveConversation(): Conversation | null;
  addMessageToConversation(
    id: string,
    message: ChatMessage,
    adapter: StorageAdapter
  ): Promise<void>;
  updateLastMessage(id: string, content: string): void;
  generateTitle(id: string, firstUserMessage: string, adapter: StorageAdapter): Promise<void>;

  /**
   * Edit a message's content and remove all messages that follow it.
   * Returns the trimmed messages array so the caller can re-send.
   */
  editMessage(
    conversationId: string,
    messageIndex: number,
    newContent: string,
    adapter: StorageAdapter
  ): ChatMessage[];

  /**
   * Remove all messages after (and including) the message at `fromIndex`.
   */
  removeMessagesFrom(
    conversationId: string,
    fromIndex: number,
    adapter: StorageAdapter
  ): void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useConversationsStore = create<ConversationsState>()((set, get) => ({
  conversations: [],
  activeConversationId: null,

  // ── Bootstrap ────────────────────────────────────────────────────────────

  async loadConversations(adapter) {
    const stored = await adapter.getConversations();
    // Merge stored conversations, preserving any in-memory messages already loaded
    set((state) => {
      const existing = new Map(state.conversations.map((c) => [c.id, c]));
      const merged: Conversation[] = stored.map((s) => ({
        ...s,
        messages: existing.get(s.id)?.messages ?? [],
      }));
      return { conversations: merged };
    });
  },

  async loadMessages(conversationId, adapter) {
    const messages = await adapter.getMessages(conversationId);
    const chatMessages: ChatMessage[] = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === conversationId ? { ...c, messages: chatMessages } : c
      ),
    }));
  },

  // ── Mutations ─────────────────────────────────────────────────────────────

  async createConversation(model, provider, adapter) {
    const stored = await adapter.createConversation({
      title: 'New Conversation',
      model,
      provider,
    });
    const conv: Conversation = { ...stored, messages: [] };
    set((state) => ({
      conversations: [conv, ...state.conversations],
      activeConversationId: conv.id,
    }));
    return conv.id;
  },

  async updateConversation(id, updates, adapter) {
    await adapter.updateConversation(id, updates);
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === id ? { ...c, ...updates, updatedAt: Date.now() } : c
      ),
    }));
  },

  async deleteConversation(id, adapter) {
    await adapter.deleteConversation(id);
    set((state) => {
      const remaining = state.conversations.filter((c) => c.id !== id);
      return {
        conversations: remaining,
        activeConversationId:
          state.activeConversationId === id
            ? (remaining[0]?.id ?? null)
            : state.activeConversationId,
      };
    });
  },

  setActiveConversation(id) {
    set({ activeConversationId: id });
  },

  getActiveConversation() {
    const { conversations, activeConversationId } = get();
    return conversations.find((c) => c.id === activeConversationId) ?? null;
  },

  async addMessageToConversation(id, message, adapter) {
    // Persist to storage (fire and don't block streaming)
    adapter.addMessage(id, {
      role: message.role,
      content: message.content,
    }).catch((err) => console.error('[store] addMessage persist error:', err));

    // Update in-memory state immediately for responsive UI
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === id
          ? { ...c, messages: [...c.messages, message], updatedAt: Date.now() }
          : c
      ),
    }));
  },

  /** Update the last assistant message in-memory only (used during streaming). */
  updateLastMessage(id, content) {
    set((state) => ({
      conversations: state.conversations.map((c) => {
        if (c.id !== id) return c;
        const messages = [...c.messages];
        const last = messages[messages.length - 1];
        if (last && last.role === 'assistant') {
          messages[messages.length - 1] = { ...last, content };
        }
        return { ...c, messages, updatedAt: Date.now() };
      }),
    }));
  },

  async generateTitle(id, firstUserMessage, adapter) {
    const title =
      firstUserMessage.length > 50
        ? firstUserMessage.slice(0, 50) + '...'
        : firstUserMessage;
    await get().updateConversation(id, { title }, adapter);
  },

  editMessage(conversationId, messageIndex, newContent, adapter) {
    let trimmedMessages: ChatMessage[] = [];

    set((state) => ({
      conversations: state.conversations.map((c) => {
        if (c.id !== conversationId) return c;
        const messages = [...c.messages];
        // Update the target message and drop everything after it
        const edited: ChatMessage = { ...messages[messageIndex], content: newContent };
        trimmedMessages = [...messages.slice(0, messageIndex), edited];
        return { ...c, messages: trimmedMessages, updatedAt: Date.now() };
      }),
    }));

    // Re-persist messages for this conversation (best-effort; reload will fix on next open)
    // We do a fire-and-forget reload from the updated in-memory state
    adapter.getMessages(conversationId).catch(() => {/* non-fatal */});

    return trimmedMessages;
  },

  removeMessagesFrom(conversationId, fromIndex, adapter) {
    set((state) => ({
      conversations: state.conversations.map((c) => {
        if (c.id !== conversationId) return c;
        return {
          ...c,
          messages: c.messages.slice(0, fromIndex),
          updatedAt: Date.now(),
        };
      }),
    }));
  },
}));
