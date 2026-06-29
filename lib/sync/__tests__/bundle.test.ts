import { buildLocalBundle, bundleCounts } from '../bundle';
import type { StorageAdapter, Conversation, Message, UserPreferences, ProviderConfig } from '../../storage';

function makeAdapter(): StorageAdapter {
  const conversations: Conversation[] = [
    { id: 'conv_a', title: 'Alpha', model: 'gpt-4o', provider: 'openai', createdAt: 1, updatedAt: 2 },
    { id: 'conv_b', title: 'Beta', model: 'claude-sonnet-4-6', provider: 'anthropic', createdAt: 3, updatedAt: 4 },
  ];
  const messages: Record<string, Message[]> = {
    conv_a: [
      { id: 'msg_1', conversationId: 'conv_a', role: 'user', content: 'hi', createdAt: 1 },
      { id: 'msg_2', conversationId: 'conv_a', role: 'assistant', content: 'hello', createdAt: 2 },
    ],
    conv_b: [{ id: 'msg_3', conversationId: 'conv_b', role: 'user', content: 'yo', createdAt: 3 }],
  };
  const prefs: UserPreferences = { theme: 'luminous', defaultModel: 'gpt-4o', defaultProvider: 'openai' };
  const configs: ProviderConfig[] = [
    { provider: 'openai', apiKey: 'sk-test', isActive: true },
    { provider: 'anthropic', apiKey: '', isActive: true },
  ];

  return {
    getConversations: async () => conversations,
    getConversation: async (id) => conversations.find((c) => c.id === id) ?? null,
    createConversation: async () => conversations[0],
    updateConversation: async () => {},
    deleteConversation: async () => {},
    getMessages: async (id) => messages[id] ?? [],
    addMessage: async () => messages.conv_a[0],
    updateMessage: async () => {},
    getPreferences: async () => prefs,
    updatePreferences: async () => {},
    getProviderConfigs: async () => configs,
    setProviderConfig: async () => {},
    getProviderApiKey: async () => null,
  };
}

describe('buildLocalBundle', () => {
  it('gathers conversations with their messages and preferences', async () => {
    const bundle = await buildLocalBundle(makeAdapter());
    expect(bundle.conversations).toHaveLength(2);
    expect(bundle.conversations[0]).toMatchObject({ id: 'conv_a', title: 'Alpha' });
    expect(bundle.conversations[0].messages.map((m) => m.id)).toEqual(['msg_1', 'msg_2']);
    expect(bundle.conversations[1].messages).toHaveLength(1);
    expect(bundle.preferences).toMatchObject({ theme: 'luminous', defaultProvider: 'openai' });
  });

  it('omits provider keys by default', async () => {
    const bundle = await buildLocalBundle(makeAdapter());
    expect(bundle.providerKeys).toBeUndefined();
  });

  it('includes non-empty provider keys when opted in', async () => {
    const bundle = await buildLocalBundle(makeAdapter(), { includeProviderKeys: true });
    expect(bundle.providerKeys).toEqual([{ provider: 'openai', apiKey: 'sk-test' }]);
  });

  it('counts conversations and messages', async () => {
    const bundle = await buildLocalBundle(makeAdapter());
    expect(bundleCounts(bundle)).toEqual({ conversations: 2, messages: 3 });
  });
});
