'use client';

import React, { useState, useEffect, useRef, useCallback, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { ChatSidebar } from '@/components/chat/ChatSidebar';
import { ChatWindow } from '@/components/chat/ChatWindow';
import { ChatInput } from '@/components/chat/ChatInput';
import { useChatStore } from '@/lib/store/chat';
import { useConversationsStore } from '@/lib/store/conversations';
import { usePersonasStore } from '@/lib/store/personas';
import { useSettingsStore } from '@/lib/store/settings';
import { useStorage } from '@/lib/storage/provider';
import { getModelById } from '@/lib/providers';
import { parseSSEStream } from '@/lib/utils/stream';
import { generateConversationTitle } from '@/lib/utils/markdown';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase/client';
import { getLocalInstalls } from '@/lib/mcp/local-installs';
import { isOnboarded } from '@/lib/onboarding';
import { useMemoryStore } from '@/lib/store/memory';
import { parseSlashCommand, SLASH_COMMANDS } from '@/lib/chat/slash-commands';
import type { ProviderName } from '@/lib/providers/types';
import type { ChatMessage } from '@/lib/providers/types';
import { AlertTriangle, X, PanelLeftOpen, PanelLeftClose } from 'lucide-react';
import { speak } from '@/lib/voice/tts';

// Stable no-op subscribe for the useSyncExternalStore hydration flag
const emptySubscribe = () => () => {};

/** Resolve the current Supabase user id, or null in standalone/unauthenticated mode. */
async function getCurrentUserId(): Promise<string | null> {
  try {
    const client = getSupabaseClient();
    if (!client) return null;
    const { data } = await client.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

export default function ChatPage() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // On mobile the sidebar renders as an overlay; track separately
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  // Hydration flag without a setState-in-effect: false on the server
  // snapshot, true on the client snapshot.
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
  const abortControllerRef = useRef<AbortController | null>(null);
  const adapter = useStorage();
  const router = useRouter();

  // First-run gate (standalone/desktop): a fresh install with no account and no
  // configured provider goes through the onboarding wizard instead of landing
  // on an empty chat it can't use. Connected mode is gated by auth middleware.
  useEffect(() => {
    if (!mounted) return;
    if (isSupabaseEnabled()) return;
    if (!isOnboarded()) router.replace('/onboarding');
  }, [mounted, router]);

  // Sync the admin memory gate on load so chat activates memory without first
  // visiting Settings (connected mode only).
  useEffect(() => {
    if (!isSupabaseEnabled()) return;
    fetch('/api/memory/settings')
      .then((r) => r.json())
      .then((s) => useMemoryStore.getState().setEnabled(Boolean(s?.enabled)))
      .catch(() => {});
  }, []);

  const {
    selectedModel,
    selectedProvider,
    isLoading,
    isStreaming,
    streamingContent,
    error,
    toolChips,
    setSelectedModel,
    setSelectedProvider,
    setLoading,
    setStreaming,
    appendStreamingContent,
    clearStreamingContent,
    setError,
    addToolChip,
    updateToolChip,
    clearToolChips,
  } = useChatStore();

  const {
    conversations,
    activeConversationId,
    createConversation,
    addMessageToConversation,
    updateConversation,
    deleteConversation,
    setActiveConversation,
    generateTitle,
    loadMessages,
    editMessage,
    removeMessagesFrom,
  } = useConversationsStore();

  const { getActivePersona } = usePersonasStore();
  const { apiKeys, ollamaUrl, lmStudioUrl } = useSettingsStore();

  // Apply the persisted default model/provider once settings have hydrated, so
  // a choice made in onboarding or Settings (e.g. a local Ollama model) powers
  // chat on launch instead of the hard-coded gpt-4o default.
  const settingsLoaded = useSettingsStore((s) => s.loaded);
  const defaultModel = useSettingsStore((s) => s.defaultModel);
  const defaultProvider = useSettingsStore((s) => s.defaultProvider);
  const appliedDefaultRef = useRef(false);
  useEffect(() => {
    if (!settingsLoaded || appliedDefaultRef.current) return;
    appliedDefaultRef.current = true;
    if (defaultModel) setSelectedModel(defaultModel);
    if (defaultProvider) setSelectedProvider(defaultProvider as ProviderName);
  }, [settingsLoaded, defaultModel, defaultProvider, setSelectedModel, setSelectedProvider]);

  const activeConversation = conversations.find(
    (c) => c.id === activeConversationId
  );
  const messages = activeConversation?.messages ?? [];

  // Load messages lazily when the active conversation changes
  useEffect(() => {
    if (!activeConversationId) return;
    const conv = conversations.find((c) => c.id === activeConversationId);
    if (conv && conv.messages.length === 0) {
      loadMessages(activeConversationId, adapter).catch(console.error);
    }
  }, [activeConversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleModelChange = (modelId: string, provider: ProviderName) => {
    setSelectedModel(modelId);
    setSelectedProvider(provider);
    // Remember the choice so it sticks across reloads and new chats.
    const s = useSettingsStore.getState();
    s.setDefaultModel(modelId, adapter).catch(() => {});
    s.setDefaultProvider(provider, adapter).catch(() => {});
  };

  const handleNewChat = useCallback(() => {
    setActiveConversation(null);
    clearStreamingContent();
    setError(null);
  }, [setActiveConversation, clearStreamingContent, setError]);

  const handleSelectConversation = (id: string) => {
    setActiveConversation(id);
    clearStreamingContent();
    setError(null);
    setLoading(false);
    setStreaming(false);
  };

  const handleDeleteConversation = useCallback(
    async (id: string) => {
      await deleteConversation(id, adapter);
    },
    [adapter, deleteConversation]
  );

  const handleStop = () => {
    abortControllerRef.current?.abort();
    setLoading(false);
    setStreaming(false);

    if (streamingContent && activeConversationId) {
      addMessageToConversation(
        activeConversationId,
        { role: 'assistant', content: streamingContent },
        adapter
      );
      clearStreamingContent();
    }
  };

  // ── Core send function ────────────────────────────────────────────────────

  const sendMessages = useCallback(
    async (conversationMessages: ChatMessage[], convId: string) => {
      const model = getModelById(selectedModel);
      if (!model) {
        setError(`Unknown model: ${selectedModel}`);
        return;
      }

      const isLocal = model.provider === 'local';
      const cloudApiKeys = apiKeys as unknown as Record<string, string>;
      const apiKey = isLocal ? '' : (cloudApiKeys[model.provider] ?? '');
      const headerKeyMap: Record<string, string> = {
        openai: 'x-openai-key',
        anthropic: 'x-anthropic-key',
        google: 'x-google-key',
        deepseek: 'x-deepseek-key',
        groq: 'x-groq-key',
        mistral: 'x-mistral-key',
        xai: 'x-xai-key',
        openrouter: 'x-openrouter-key',
      };
      const headerKey = headerKeyMap[model.provider];

      // Memory: connected mode uses a session-authenticated server path; standalone
      // mode (no Supabase) builds/stores memory entirely client-side via IndexedDB.
      const memState = useMemoryStore.getState();
      memState.setLastUsedCount(0); // reset the "used N" badge for this turn
      const memoryUserId = memState.memoryHeader() === '1' ? await getCurrentUserId() : null;
      const isLocalMemory = !memoryUserId && memState.localActive() && !isSupabaseEnabled();

      // In local mode, build the retrieval block client-side and inject it.
      let messagesToSend = conversationMessages;
      if (isLocalMemory) {
        try {
          const { createMemoryStore, buildRetrievalBlock } = await import('@/lib/memory');
          const store = createMemoryStore({ client: null });
          const lastUser = [...conversationMessages].reverse().find((m) => m.role === 'user');
          if (lastUser) {
            const { block, count } = await buildRetrievalBlock(
              store,
              { userId: null, projectId: null },
              lastUser.content
            );
            // Re-check live state — the user may have toggled memory off during
            // the async retrieval above.
            if (block && memState.localActive()) {
              const existingSystem = conversationMessages.find((m) => m.role === 'system');
              const sys = existingSystem ? `${existingSystem.content}\n\n${block}` : block;
              messagesToSend = [
                { role: 'system', content: sys },
                ...conversationMessages.filter((m) => m.role !== 'system'),
              ];
              useMemoryStore.getState().setLastUsedCount(count);
            }
          }
        } catch {
          /* non-fatal */
        }
      }

      // Get the active persona's system prompt
      const activePersona = getActivePersona();
      const systemPrompt = activePersona?.systemPrompt;

      clearToolChips();
      setLoading(true);
      setStreaming(true);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(apiKey && headerKey ? { [headerKey]: apiKey } : {}),
            ...(isLocal ? {
              'x-ollama-url': ollamaUrl,
              'x-lmstudio-url': lmStudioUrl,
            } : {}),
            ...(memoryUserId ? { 'x-memory-enabled': '1' } : {}),
            ...(cloudApiKeys.openai ? { 'x-openai-key': cloudApiKeys.openai } : {}),
          },
          body: JSON.stringify({
            messages: messagesToSend,
            model: selectedModel,
            provider: selectedProvider,
            ...(systemPrompt ? { systemPrompt } : {}),
            ...(memoryUserId ? { userId: memoryUserId } : {}),
            // Standalone: pass localStorage connector installs so their tools can run server-side.
            ...(!isSupabaseEnabled() ? { mcpInstalls: getLocalInstalls() } : {}),
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        if (!response.body) {
          throw new Error('No response body');
        }

        let fullContent = '';

        await parseSSEStream(
          response.body,
          (chunk) => {
            appendStreamingContent(chunk);
            fullContent += chunk;
          },
          async () => {
            if (convId) {
              await addMessageToConversation(
                convId,
                { role: 'assistant', content: fullContent },
                adapter
              );
            }
            clearStreamingContent();
            setLoading(false);
            setStreaming(false);

            // Auto-read: speak the completed reply when the user has enabled it.
            const voiceState = useSettingsStore.getState().voice;
            if (voiceState.tts.enabled && voiceState.tts.autoRead && fullContent) {
              const voiceApiKey = useSettingsStore.getState().apiKeys.openai || undefined;
              speak(fullContent, {
                provider: voiceState.tts.provider,
                voice: voiceState.tts.voice,
                speed: voiceState.tts.speed,
                model: voiceState.tts.model,
                baseUrl: voiceState.tts.baseUrl,
                apiKey: voiceApiKey,
              });
            }

            if (convId) {
              await updateConversation(
                convId,
                { model: selectedModel, provider: selectedProvider },
                adapter
              );
            }

            // ── Conversation-end memory extraction (fire-and-forget) ──────────
            const fullThread = [
              ...conversationMessages,
              { role: 'assistant' as const, content: fullContent },
            ];
            if (memoryUserId) {
              // Connected mode: server extracts + stores (userId derived from session).
              try {
                void fetch('/api/memory/extract', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    messages: fullThread,
                    conversationId: convId,
                    model: selectedModel,
                    provider: selectedProvider,
                    apiKey,
                    embedderKey: cloudApiKeys.openai || undefined,
                    incognito: useMemoryStore.getState().incognito,
                  }),
                }).catch(() => {
                  /* non-fatal */
                });
              } catch {
                /* non-fatal — pre-fetch synchronous guard */
              }
            } else if (isLocalMemory) {
              // Standalone mode: extract via the stateless endpoint, persist to IndexedDB.
              void (async () => {
                try {
                  const { createMemoryStore, ingestExtraction } = await import('@/lib/memory');
                  const store = createMemoryStore({ client: null });
                  const localScope = { userId: null, projectId: null };
                  const existing = await store.search(
                    localScope,
                    fullThread.map((m) => m.content).join(' '),
                    { limit: 10 }
                  );
                  const res = await fetch('/api/memory/extract-local', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      messages: fullThread,
                      model: selectedModel,
                      provider: selectedProvider,
                      apiKey,
                      existing,
                      incognito: useMemoryStore.getState().incognito,
                    }),
                  });
                  const json = await res.json();
                  if (json?.error) {
                    console.warn('[memory] local extraction failed:', json.error);
                  } else if (json?.result) {
                    await ingestExtraction(store, localScope, json.result, convId);
                  }
                } catch {
                  /* non-fatal */
                }
              })();
            }
          },
          (err) => {
            if (err.name === 'AbortError') return;
            setError(err.message);
            setLoading(false);
            setStreaming(false);
            clearStreamingContent();
          },
          (meta) => {
            if (typeof meta.memoryCount === 'number') {
              useMemoryStore.getState().setLastUsedCount(meta.memoryCount);
            }
            if (meta.tool_call && typeof meta.tool_call === 'object') {
              const tc = meta.tool_call as { slug: string; tool: string };
              addToolChip({ slug: tc.slug, tool: tc.tool });
            }
            if (meta.tool_result && typeof meta.tool_result === 'object') {
              const tr = meta.tool_result as { slug: string; tool: string; ok: boolean };
              updateToolChip(tr.slug, tr.tool, tr.ok);
            }
          }
        );
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;

        const message = err instanceof Error ? err.message : 'Something went wrong';

        try {
          const parsed = JSON.parse(message);
          if (parsed.error) {
            setError(parsed.error);
            return;
          }
        } catch {
          // Not JSON
        }

        setError(message);
        setLoading(false);
        setStreaming(false);
        clearStreamingContent();
      }
    },
    [
      selectedModel,
      selectedProvider,
      apiKeys,
      ollamaUrl,
      lmStudioUrl,
      adapter,
      addMessageToConversation,
      appendStreamingContent,
      clearStreamingContent,
      setError,
      setLoading,
      setStreaming,
      updateConversation,
      getActivePersona,
      addToolChip,
      updateToolChip,
      clearToolChips,
    ]
  );

  // ── Handle new user message send ─────────────────────────────────────────

  const handleSend = useCallback(
    async (userMessage: string) => {
      if (!userMessage.trim() || isLoading) return;

      setError(null);
      clearStreamingContent();

      // ── Slash-command interception ────────────────────────────────────────
      const cmd = parseSlashCommand(userMessage);
      if (cmd) {
        // /new — just start a fresh conversation.
        if (cmd.kind === 'new') {
          handleNewChat();
          return;
        }

        let cId = activeConversationId;
        if (!cId) cId = await createConversation(selectedModel, selectedProvider, adapter);
        await addMessageToConversation(cId, { role: 'user', content: userMessage }, adapter);
        const note = (content: string) =>
          addMessageToConversation(cId!, { role: 'assistant', content }, adapter);

        const uid = await getCurrentUserId();
        const localActive = useMemoryStore.getState().localActive() && !isSupabaseEnabled();

        if (cmd.kind === 'help') {
          await note(
            SLASH_COMMANDS.map(
              (c) => `${c.label}${c.argHint ? ` <${c.argHint}>` : ''} — ${c.description}`
            ).join('\n')
          );
          return;
        }

        if (cmd.kind === 'incognito') {
          const next = !useMemoryStore.getState().incognito;
          useMemoryStore.getState().setIncognito(next);
          await note(
            next
              ? "🕶️ Incognito on — new memories won't be captured this session."
              : '🕶️ Incognito off — capturing memories again.'
          );
          return;
        }

        if (cmd.kind === 'remember' || cmd.kind === 'global') {
          let saved = false;
          if (uid) {
            await fetch('/api/memory/command', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ kind: cmd.kind, text: cmd.text, conversationId: cId }),
            }).catch(() => {});
            saved = true;
          } else if (localActive) {
            try {
              const { createMemoryStore, ingestCommand } = await import('@/lib/memory');
              const store = createMemoryStore({ client: null });
              await ingestCommand(store, { userId: null, projectId: null }, cmd.kind, cmd.text ?? '', cId);
              saved = true;
            } catch {
              /* non-fatal */
            }
          }
          await note(
            saved
              ? `🧠 Saved to memory${cmd.kind === 'global' ? ' (shared globally)' : ''}.`
              : '🧠 Memory is off — enable it in Settings to save this.'
          );
          return;
        }

        if (cmd.kind === 'forget') {
          let ok = false;
          let count = 0;
          if (uid) {
            try {
              const res = await fetch('/api/memory/forget', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: cmd.text }),
              });
              const json = await res.json();
              ok = Boolean(json.ok);
              count = json.forgotten ?? 0;
            } catch {
              /* non-fatal */
            }
          } else if (localActive) {
            try {
              const { createMemoryStore } = await import('@/lib/memory');
              const store = createMemoryStore({ client: null });
              const scope = { userId: null, projectId: null };
              const all = await store.listAll(scope);
              const needle = (cmd.text ?? '').toLowerCase();
              const matches = all.filter((m) =>
                `${m.content} ${m.summary ?? ''}`.toLowerCase().includes(needle)
              );
              for (const m of matches) await store.archive(m.id);
              ok = true;
              count = matches.length;
            } catch {
              /* non-fatal */
            }
          }
          await note(
            ok
              ? `🗑️ Forgot ${count} ${count === 1 ? 'memory' : 'memories'} matching “${cmd.text}”.`
              : '🧠 Memory is off — nothing to forget.'
          );
          return;
        }

        if (cmd.kind === 'memories') {
          let msg: string;
          if (uid) {
            try {
              const res = await fetch('/api/memory/list');
              const json = await res.json();
              const mems = (json.memories ?? []) as Array<{ content: string; summary?: string }>;
              const recent = mems.slice(0, 5).map((m) => m.summary || m.content);
              msg =
                `🧠 I remember ${json.usage?.memories ?? mems.length} thing(s).` +
                (recent.length ? ` Recent: ${recent.join(' · ')}` : '');
            } catch {
              msg = '🧠 Could not load memories.';
            }
          } else if (localActive) {
            try {
              const { createMemoryStore } = await import('@/lib/memory');
              const store = createMemoryStore({ client: null });
              const all = await store.listAll({ userId: null, projectId: null });
              const recent = all.slice(0, 5).map((m) => m.summary || m.content);
              msg =
                `🧠 I remember ${all.length} thing(s) (local).` +
                (recent.length ? ` Recent: ${recent.join(' · ')}` : '');
            } catch {
              msg = '🧠 Could not load local memories.';
            }
          } else {
            msg = '🧠 Memory is off — enable it in Settings.';
          }
          await note(msg);
          return;
        }
      }

      let convId = activeConversationId;
      if (!convId) {
        convId = await createConversation(selectedModel, selectedProvider, adapter);
      }

      const userMsg: ChatMessage = { role: 'user', content: userMessage };
      await addMessageToConversation(convId, userMsg, adapter);

      const conv = conversations.find((c) => c.id === convId);
      if (conv && conv.messages.length === 0) {
        await generateTitle(convId, userMessage, adapter);
      } else if (conv && conv.title === 'New Conversation') {
        await generateTitle(convId, generateConversationTitle(userMessage), adapter);
      }

      const updatedConv = useConversationsStore
        .getState()
        .conversations.find((c) => c.id === convId);
      const allMessages = updatedConv?.messages ?? [];

      await sendMessages(allMessages, convId);
    },
    [
      isLoading,
      activeConversationId,
      selectedModel,
      selectedProvider,
      conversations,
      adapter,
      addMessageToConversation,
      clearStreamingContent,
      createConversation,
      generateTitle,
      setError,
      sendMessages,
      handleNewChat,
    ]
  );

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key === 'k') {
        e.preventDefault();
        if (!sidebarOpen) setSidebarOpen(true);
        setTimeout(() => {
          const el = document.querySelector<HTMLInputElement>(
            '[placeholder="Search conversations..."]'
          );
          el?.focus();
        }, 50);
        return;
      }

      if (mod && e.shiftKey && e.key === 'N') {
        e.preventDefault();
        handleNewChat();
        return;
      }

      if (e.key === 'Escape' && window.innerWidth < 768) {
        setMobileSidebarOpen(false);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sidebarOpen, handleNewChat]);

  // Listen for suggestion clicks from the empty state
  useEffect(() => {
    const handler = (e: CustomEvent<string>) => {
      handleSend(e.detail);
    };
    window.addEventListener('lucy:suggestion', handler as EventListener);
    return () => window.removeEventListener('lucy:suggestion', handler as EventListener);
  }, [handleSend]);

  // ── Edit message ──────────────────────────────────────────────────────────

  const handleEditMessage = useCallback(
    async (messageIndex: number, newContent: string) => {
      if (!activeConversationId || isLoading) return;

      setError(null);
      clearStreamingContent();

      // editMessage trims messages after the edited one and returns the trimmed list
      const trimmedMessages = editMessage(
        activeConversationId,
        messageIndex,
        newContent,
        adapter
      );

      await sendMessages(trimmedMessages, activeConversationId);
    },
    [activeConversationId, isLoading, adapter, editMessage, clearStreamingContent, setError, sendMessages]
  );

  // ── Regenerate assistant message ─────────────────────────────────────────

  const handleRegenerate = useCallback(
    async (messageIndex: number) => {
      if (!activeConversationId || isLoading) return;

      setError(null);
      clearStreamingContent();

      // Remove the assistant message and all messages after it
      removeMessagesFrom(activeConversationId, messageIndex, adapter);

      // Get the conversation with messages up to (but not including) the assistant message
      const conv = useConversationsStore
        .getState()
        .conversations.find((c) => c.id === activeConversationId);
      const messagesUpTo = conv?.messages.slice(0, messageIndex) ?? [];

      await sendMessages(messagesUpTo, activeConversationId);
    },
    [activeConversationId, isLoading, adapter, removeMessagesFrom, clearStreamingContent, setError, sendMessages]
  );

  // ─────────────────────────────────────────────────────────────────────────

  const currentModel = getModelById(selectedModel);
  const providerName = (currentModel?.provider ?? 'openai') as ProviderName;
  const modelName = currentModel?.name ?? selectedModel;

  // Determine active persona display
  const activePersona = getActivePersona();

  const toggleConversationSidebar = () => {
    if (window.innerWidth < 768) {
      setMobileSidebarOpen((v) => !v);
    } else {
      setSidebarOpen((v) => !v);
    }
  };

  return (
    <AppShell title="Chat" padded={false}>
      <div className="flex flex-1 overflow-hidden h-full">
        {/* Conversation list sidebar (tier 2) — desktop */}
        {sidebarOpen && (
          <div className="w-64 shrink-0 hidden md:block">
            <ChatSidebar
              onNewChat={handleNewChat}
              onSelectConversation={handleSelectConversation}
              onDeleteConversation={handleDeleteConversation}
            />
          </div>
        )}

        {/* Conversation list sidebar (tier 2) — mobile overlay */}
        {mobileSidebarOpen && (
          <ChatSidebar
            onNewChat={handleNewChat}
            onSelectConversation={handleSelectConversation}
            onDeleteConversation={handleDeleteConversation}
            mobileOverlay={true}
            onMobileClose={() => setMobileSidebarOpen(false)}
          />
        )}

        {/* Main chat area */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Chat toolbar row: conversation list toggle + active persona */}
          <div className="flex items-center gap-2 px-3 py-1 bg-gray-900/50 border-b border-gray-800/50 shrink-0">
            <button
              onClick={toggleConversationSidebar}
              className="p-1.5 rounded-md text-gray-500 hover:text-gray-200 hover:bg-gray-700 transition-colors"
              aria-label={sidebarOpen ? 'Hide conversations' : 'Show conversations'}
              title={sidebarOpen ? 'Hide conversations' : 'Show conversations'}
            >
              {sidebarOpen
                ? <PanelLeftClose className="w-4 h-4" />
                : <PanelLeftOpen className="w-4 h-4" />
              }
            </button>
            {/* Active persona indicator (deferred to avoid hydration mismatch) */}
            {mounted && activePersona && activePersona.id !== 'builtin-general' && (
              <>
                <span className="text-base leading-none">{activePersona.icon}</span>
                <span className="text-xs text-gray-400">
                  Using <span className="text-gray-200 font-medium">{activePersona.name}</span> persona
                </span>
              </>
            )}
          </div>

          {/* Error banner */}
          {error && (
            <div className="flex items-center gap-3 px-4 py-2.5 bg-red-950 border-b border-red-900 text-sm text-red-300 shrink-0">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
              <span className="flex-1">{error}</span>
              <button
                onClick={() => setError(null)}
                className="text-red-400 hover:text-red-200 transition-colors"
                aria-label="Dismiss error"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <ChatWindow
            messages={messages}
            streamingContent={streamingContent}
            isStreaming={isStreaming}
            provider={providerName}
            modelName={modelName}
            conversationTitle={activeConversation?.title ?? 'Conversation'}
            toolChips={toolChips}
            onEditMessage={handleEditMessage}
            onRegenerate={handleRegenerate}
          />

          <ChatInput
            onSend={handleSend}
            onStop={handleStop}
            isLoading={isLoading}
            selectedModel={selectedModel}
            onModelChange={handleModelChange}
          />
        </main>
      </div>
    </AppShell>
  );
}
