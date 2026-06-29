/**
 * Tests for lib/storage/local.ts (LocalStorageAdapter)
 *
 * localStorage is mocked via a simple in-memory store so tests run in Node.
 */

import { LocalStorageAdapter } from '@/lib/storage/local';

// ── In-memory localStorage mock ──────────────────────────────────────────────

const localStorageStore: Record<string, string> = {};

const localStorageMock = {
  getItem: jest.fn((key: string) => localStorageStore[key] ?? null),
  setItem: jest.fn((key: string, value: string) => {
    localStorageStore[key] = value;
  }),
  removeItem: jest.fn((key: string) => {
    delete localStorageStore[key];
  }),
  clear: jest.fn(() => {
    Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k]);
  }),
  get length() {
    return Object.keys(localStorageStore).length;
  },
  key: jest.fn((index: number) => Object.keys(localStorageStore)[index] ?? null),
};

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeAdapter() {
  return new LocalStorageAdapter();
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('LocalStorageAdapter', () => {
  beforeEach(() => {
    localStorageMock.clear();
    jest.clearAllMocks();
  });

  // ── Conversations ──────────────────────────────────────────────────────────

  describe('conversations', () => {
    it('returns empty array when no conversations exist', async () => {
      const adapter = makeAdapter();
      const convs = await adapter.getConversations();
      expect(convs).toEqual([]);
    });

    it('creates a conversation and returns it', async () => {
      const adapter = makeAdapter();
      const conv = await adapter.createConversation({ title: 'Test Chat' });
      expect(conv.id).toMatch(/^conv_/);
      expect(conv.title).toBe('Test Chat');
      expect(conv.model).toBe('gpt-4o');
    });

    it('creates conversation with custom model and provider', async () => {
      const adapter = makeAdapter();
      const conv = await adapter.createConversation({
        title: 'Claude Chat',
        model: 'claude-sonnet-4-6',
        provider: 'anthropic',
      });
      expect(conv.model).toBe('claude-sonnet-4-6');
      expect(conv.provider).toBe('anthropic');
    });

    it('getConversations returns all created conversations', async () => {
      const adapter = makeAdapter();
      await adapter.createConversation({ title: 'First' });
      await adapter.createConversation({ title: 'Second' });
      const convs = await adapter.getConversations();
      expect(convs).toHaveLength(2);
    });

    it('getConversation returns the correct conversation by id', async () => {
      const adapter = makeAdapter();
      const created = await adapter.createConversation({ title: 'Find Me' });
      const found = await adapter.getConversation(created.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
      expect(found!.title).toBe('Find Me');
    });

    it('getConversation returns null for unknown id', async () => {
      const adapter = makeAdapter();
      const result = await adapter.getConversation('nonexistent_id');
      expect(result).toBeNull();
    });

    it('updateConversation changes title and bumps updatedAt', async () => {
      const adapter = makeAdapter();
      const conv = await adapter.createConversation({ title: 'Old Title' });
      const beforeUpdate = conv.updatedAt;

      // Tiny delay so updatedAt differs
      await new Promise((r) => setTimeout(r, 5));
      await adapter.updateConversation(conv.id, { title: 'New Title' });

      const updated = await adapter.getConversation(conv.id);
      expect(updated!.title).toBe('New Title');
      expect(updated!.updatedAt).toBeGreaterThanOrEqual(beforeUpdate);
    });

    it('deleteConversation removes it from the list', async () => {
      const adapter = makeAdapter();
      const conv = await adapter.createConversation({ title: 'To Delete' });
      await adapter.deleteConversation(conv.id);
      const convs = await adapter.getConversations();
      expect(convs.find((c) => c.id === conv.id)).toBeUndefined();
    });

    it('deleteConversation also removes associated messages', async () => {
      const adapter = makeAdapter();
      const conv = await adapter.createConversation({ title: 'Chat' });
      await adapter.addMessage(conv.id, { role: 'user', content: 'Hello' });
      await adapter.deleteConversation(conv.id);
      const messages = await adapter.getMessages(conv.id);
      expect(messages).toHaveLength(0);
    });
  });

  // ── Messages ───────────────────────────────────────────────────────────────

  describe('messages', () => {
    it('returns empty array for a conversation with no messages', async () => {
      const adapter = makeAdapter();
      const conv = await adapter.createConversation({});
      const msgs = await adapter.getMessages(conv.id);
      expect(msgs).toEqual([]);
    });

    it('addMessage creates a message with generated id and correct fields', async () => {
      const adapter = makeAdapter();
      const conv = await adapter.createConversation({});
      const msg = await adapter.addMessage(conv.id, {
        role: 'user',
        content: 'Hello world',
      });
      expect(msg.id).toMatch(/^msg_/);
      expect(msg.conversationId).toBe(conv.id);
      expect(msg.role).toBe('user');
      expect(msg.content).toBe('Hello world');
    });

    it('getMessages returns only messages for the specified conversation', async () => {
      const adapter = makeAdapter();
      const conv1 = await adapter.createConversation({});
      const conv2 = await adapter.createConversation({});

      await adapter.addMessage(conv1.id, { role: 'user', content: 'From conv1' });
      await adapter.addMessage(conv2.id, { role: 'user', content: 'From conv2' });

      const msgs1 = await adapter.getMessages(conv1.id);
      const msgs2 = await adapter.getMessages(conv2.id);

      expect(msgs1).toHaveLength(1);
      expect(msgs1[0].content).toBe('From conv1');
      expect(msgs2).toHaveLength(1);
      expect(msgs2[0].content).toBe('From conv2');
    });

    it('updateMessage modifies message content', async () => {
      const adapter = makeAdapter();
      const conv = await adapter.createConversation({});
      const msg = await adapter.addMessage(conv.id, {
        role: 'assistant',
        content: 'Partial...',
      });

      await adapter.updateMessage(msg.id, { content: 'Complete response' });

      const msgs = await adapter.getMessages(conv.id);
      expect(msgs[0].content).toBe('Complete response');
    });
  });

  // ── Preferences ────────────────────────────────────────────────────────────

  describe('preferences', () => {
    it('returns default preferences (luminous theme) when none are saved', async () => {
      const adapter = makeAdapter();
      const prefs = await adapter.getPreferences();
      expect(prefs.theme).toBe('luminous');
      expect(prefs.defaultModel).toBe('gpt-4o');
      expect(prefs.defaultProvider).toBe('openai');
    });

    it('updatePreferences merges with existing preferences', async () => {
      const adapter = makeAdapter();
      await adapter.updatePreferences({ theme: 'light' });
      const prefs = await adapter.getPreferences();
      expect(prefs.theme).toBe('light');
      expect(prefs.defaultModel).toBe('gpt-4o'); // unchanged default
    });

    it('updatePreferences can change multiple fields at once', async () => {
      const adapter = makeAdapter();
      await adapter.updatePreferences({
        theme: 'light',
        defaultModel: 'gpt-4o-mini',
        defaultProvider: 'openai',
      });
      const prefs = await adapter.getPreferences();
      expect(prefs.theme).toBe('light');
      expect(prefs.defaultModel).toBe('gpt-4o-mini');
    });
  });

  // ── Provider configs ────────────────────────────────────────────────────────

  describe('provider configs', () => {
    it('returns empty array when no configs exist', async () => {
      const adapter = makeAdapter();
      const configs = await adapter.getProviderConfigs();
      expect(configs).toEqual([]);
    });

    it('setProviderConfig adds a new config', async () => {
      const adapter = makeAdapter();
      await adapter.setProviderConfig('openai', 'sk-test-key');
      const key = await adapter.getProviderApiKey('openai');
      expect(key).toBe('sk-test-key');
    });

    it('setProviderConfig updates an existing config', async () => {
      const adapter = makeAdapter();
      await adapter.setProviderConfig('openai', 'sk-old');
      await adapter.setProviderConfig('openai', 'sk-new');
      const key = await adapter.getProviderApiKey('openai');
      expect(key).toBe('sk-new');
    });

    it('getProviderApiKey returns null for unconfigured provider', async () => {
      const adapter = makeAdapter();
      const key = await adapter.getProviderApiKey('anthropic');
      expect(key).toBeNull();
    });
  });
});
