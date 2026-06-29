'use client';

/**
 * LucyWidget — embeddable chat widget for external apps.
 *
 * Renders as a floating chat bubble (Intercom/Drift style) in the
 * bottom-right corner by default. When expanded it shows a full
 * streaming chat window with model selection and optional project context.
 *
 * Usage in another Next.js app:
 *   import { LucyWidget } from 'lucy-ai/components/embed/LucyWidget';
 *   <LucyWidget projectId="contractors-room" position="bottom-right" />
 *
 * Or via the embed script:
 *   <script src="https://lucy.example.com/api/embed?project=contractors-room" async />
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { X, Send, Loader2, ChevronDown } from 'lucide-react';
import { LucyMark } from '@/components/brand/LucyMark';
import { parseSSEStream } from '@/lib/utils/stream';

// ─── Types ────────────────────────────────────────────────────────────────

export interface LucyWidgetProps {
  /** Integration context to load (e.g. 'contractors-room') */
  projectId?: string;
  position?: 'bottom-right' | 'bottom-left' | 'inline';
  theme?: 'dark' | 'light' | 'auto';
  defaultModel?: string;
  height?: string;
  showWorkflows?: boolean;
  /** Pass context directly instead of fetching it */
  contextData?: Record<string, unknown>;
  /** Fired when the AI triggers an action on the host app */
  onAction?: (action: string, params: Record<string, unknown>) => void;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

// ─── Lucy hosted URL (falls back to current origin for self-hosting) ──────

function getChatEndpoint(): string {
  if (typeof window === 'undefined') return '/api/chat';
  // When used as an embedded widget from another origin, point at the Lucy deployment
  const lucyOrigin =
    (window as Window & { __LUCY_ORIGIN__?: string }).__LUCY_ORIGIN__ ??
    window.location.origin;
  return `${lucyOrigin}/api/chat`;
}

// ─── Widget component ─────────────────────────────────────────────────────

export function LucyWidget({
  projectId,
  position = 'bottom-right',
  theme = 'dark',
  defaultModel = 'gpt-4o',
  height = '480px',
  contextData,
  onAction,
}: LucyWidgetProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showApiKeyPrompt, setShowApiKeyPrompt] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Auto-scroll on new content
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  // Build system prompt from context
  const buildSystemPrompt = useCallback((): string => {
    const parts: string[] = [
      'You are Lucy, a helpful AI assistant embedded in an application.',
    ];

    if (projectId) {
      parts.push(`You are currently assisting a user in the ${projectId} app.`);
    }

    if (contextData) {
      parts.push(
        'Here is relevant context about the current page:',
        JSON.stringify(contextData, null, 2)
      );
    }

    if (onAction) {
      parts.push(
        'When the user asks you to perform an action, describe what you would do ' +
          'and indicate the action name so the host application can execute it.'
      );
    }

    return parts.join('\n\n');
  }, [projectId, contextData, onAction]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');

    const newMessages: Message[] = [...messages, { role: 'user', content: userMessage }];
    setMessages(newMessages);
    setIsLoading(true);
    setStreamingContent('');

    const systemPrompt = buildSystemPrompt();
    const chatMessages = [
      { role: 'system' as const, content: systemPrompt },
      ...newMessages,
    ];

    // Infer provider from model id
    const provider = defaultModel.startsWith('claude')
      ? 'anthropic'
      : defaultModel.startsWith('gemini')
      ? 'google'
      : 'openai';

    const headerKey =
      provider === 'anthropic'
        ? 'x-anthropic-key'
        : provider === 'google'
        ? 'x-google-key'
        : 'x-openai-key';

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch(getChatEndpoint(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { [headerKey]: apiKey } : {}),
        },
        body: JSON.stringify({
          messages: chatMessages,
          model: defaultModel,
          provider,
          projectId,
        }),
        signal: controller.signal,
      });

      if (response.status === 401 || !response.ok) {
        setShowApiKeyPrompt(true);
        setIsLoading(false);
        return;
      }

      if (!response.body) throw new Error('No response body');

      let fullContent = '';

      await parseSSEStream(
        response.body,
        (chunk) => {
          setStreamingContent((prev) => prev + chunk);
          fullContent += chunk;
        },
        () => {
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', content: fullContent },
          ]);
          setStreamingContent('');
          setIsLoading(false);
        },
        (err) => {
          if (err.name === 'AbortError') return;
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: `Sorry, I encountered an error: ${err.message}`,
            },
          ]);
          setStreamingContent('');
          setIsLoading(false);
        }
      );
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `Sorry, something went wrong. Please check your API key in settings.`,
          },
        ]);
      }
      setStreamingContent('');
      setIsLoading(false);
    }
  }, [input, isLoading, messages, apiKey, defaultModel, projectId, buildSystemPrompt]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Position classes
  const positionCls =
    position === 'bottom-left'
      ? 'bottom-4 left-4'
      : position === 'inline'
      ? 'relative'
      : 'bottom-4 right-4';

  const fixedOrRelative = position === 'inline' ? 'relative' : 'fixed';

  if (position === 'inline') {
    return (
      <div
        className="flex flex-col bg-gray-900 border border-gray-700 rounded-xl overflow-hidden"
        style={{ height }}
      >
        <WidgetHeader onClose={() => setOpen(false)} showClose={false} />
        <WidgetBody
          messages={messages}
          streamingContent={streamingContent}
          isLoading={isLoading}
          input={input}
          setInput={setInput}
          onSend={handleSend}
          onKeyDown={handleKeyDown}
          bottomRef={bottomRef}
          showApiKeyPrompt={showApiKeyPrompt}
          apiKey={apiKey}
          setApiKey={setApiKey}
          onApiKeySave={() => setShowApiKeyPrompt(false)}
        />
      </div>
    );
  }

  return (
    <div className={`${fixedOrRelative} ${positionCls} z-50`}>
      {/* Chat window */}
      {open && (
        <div
          className="
            mb-3 w-80 bg-gray-900 border border-gray-700 rounded-xl
            shadow-2xl flex flex-col overflow-hidden
          "
          style={{ height }}
        >
          <WidgetHeader onClose={() => setOpen(false)} showClose />
          <WidgetBody
            messages={messages}
            streamingContent={streamingContent}
            isLoading={isLoading}
            input={input}
            setInput={setInput}
            onSend={handleSend}
            onKeyDown={handleKeyDown}
            bottomRef={bottomRef}
            showApiKeyPrompt={showApiKeyPrompt}
            apiKey={apiKey}
            setApiKey={setApiKey}
            onApiKeySave={() => setShowApiKeyPrompt(false)}
          />
        </div>
      )}

      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="
          ml-auto flex items-center justify-center
          w-12 h-12 rounded-full
          bg-gradient-to-br from-lucy-500 to-lucy-700
          shadow-lg hover:shadow-xl hover:scale-105
          transition-all duration-150
        "
        aria-label={open ? 'Close Lucy chat' : 'Open Lucy chat'}
      >
        {open ? (
          <ChevronDown className="w-5 h-5 text-white" />
        ) : (
          <LucyMark className="w-7 h-7" />
        )}
      </button>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────

function WidgetHeader({
  onClose,
  showClose,
}: {
  onClose: () => void;
  showClose: boolean;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-800 bg-gray-900 shrink-0">
      <LucyMark className="w-6 h-6 rounded-md" />
      <span className="text-sm font-semibold text-white flex-1">Lucy</span>
      <span className="text-xs text-gray-500">AI assistant</span>
      {showClose && (
        <button
          onClick={onClose}
          className="p-1 text-gray-500 hover:text-gray-300 transition-colors rounded"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

function WidgetBody({
  messages,
  streamingContent,
  isLoading,
  input,
  setInput,
  onSend,
  onKeyDown,
  bottomRef,
  showApiKeyPrompt,
  apiKey,
  setApiKey,
  onApiKeySave,
}: {
  messages: Message[];
  streamingContent: string;
  isLoading: boolean;
  input: string;
  setInput: (v: string) => void;
  onSend: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  bottomRef: React.RefObject<HTMLDivElement | null>;
  showApiKeyPrompt: boolean;
  apiKey: string;
  setApiKey: (v: string) => void;
  onApiKeySave: () => void;
}) {
  return (
    <>
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 text-sm">
        {messages.length === 0 && !isLoading && (
          <p className="text-gray-500 text-center text-xs pt-8">
            Hi! I&apos;m Lucy. Ask me anything about your data or how to use this app.
          </p>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {m.role === 'assistant' && (
              <LucyMark className="w-5 h-5 shrink-0 mt-0.5" />
            )}
            <div
              className={`
                max-w-[85%] px-3 py-2 rounded-xl text-xs leading-relaxed
                ${m.role === 'user'
                  ? 'bg-lucy-600 text-white rounded-br-sm'
                  : 'bg-gray-800 text-gray-200 rounded-bl-sm'
                }
              `}
            >
              {m.content}
            </div>
          </div>
        ))}

        {/* Streaming */}
        {streamingContent && (
          <div className="flex gap-2 justify-start">
            <LucyMark className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="max-w-[85%] px-3 py-2 rounded-xl rounded-bl-sm bg-gray-800 text-gray-200 text-xs leading-relaxed">
              {streamingContent}
              <span className="inline-block w-1 h-3 bg-lucy-400 animate-pulse ml-0.5 align-middle" />
            </div>
          </div>
        )}

        {isLoading && !streamingContent && (
          <div className="flex gap-2 justify-start">
            <LucyMark className="w-5 h-5 shrink-0" />
            <div className="px-3 py-2 rounded-xl rounded-bl-sm bg-gray-800">
              <Loader2 className="w-3 h-3 text-gray-400 animate-spin" />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* API key prompt */}
      {showApiKeyPrompt && (
        <div className="px-3 py-2 border-t border-gray-800 bg-gray-900/80">
          <p className="text-xs text-amber-400 mb-1.5">Enter your OpenAI API key to continue:</p>
          <div className="flex gap-1.5">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              className="
                flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1
                text-xs text-gray-100 placeholder-gray-600
                focus:outline-none focus:border-lucy-500
              "
            />
            <button
              onClick={onApiKeySave}
              className="px-2 py-1 bg-lucy-600 text-white text-xs rounded hover:bg-lucy-700 transition-colors"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="px-3 py-2 border-t border-gray-800 bg-gray-900 shrink-0">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask Lucy anything..."
            rows={1}
            className="
              flex-1 bg-gray-800 border border-gray-700 rounded-lg
              px-3 py-2 text-xs text-gray-100 placeholder-gray-600
              resize-none focus:outline-none focus:border-lucy-500
              max-h-24 overflow-y-auto
            "
            style={{ minHeight: '36px' }}
          />
          <button
            onClick={onSend}
            disabled={!input.trim() || isLoading}
            className="
              p-2 rounded-lg bg-lucy-600 text-white
              hover:bg-lucy-700 disabled:opacity-40
              transition-colors shrink-0
            "
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </>
  );
}
