'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ChatMessage } from './ChatMessage';
import { useMemoryStore } from '@/lib/store/memory';
import { estimateConversationTokens } from '@/lib/utils/tokens';
import type { ChatMessage as ChatMessageType } from '@/lib/providers/types';
import type { ProviderName } from '@/lib/providers/types';
import type { ToolChip } from '@/lib/store/chat';
import { MoreHorizontal, Download, FileJson, Hash } from 'lucide-react';
import { LucyMark } from '@/components/brand/LucyMark';

interface ChatWindowProps {
  messages: ChatMessageType[];
  streamingContent: string;
  isStreaming: boolean;
  provider: ProviderName;
  modelName: string;
  conversationTitle?: string;
  toolChips?: ToolChip[];
  /** Called when the user saves an edit on a user message */
  onEditMessage?: (messageIndex: number, newContent: string) => void;
  /** Called when the user clicks regenerate on an assistant message */
  onRegenerate?: (messageIndex: number) => void;
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 px-4 text-center">
      <LucyMark className="w-16 h-16 rounded-2xl" />
      <div>
        <h2 className="text-2xl font-semibold text-white mb-2">How can I help you today?</h2>
        <p className="text-gray-400 max-w-md">
          Ask me anything — I&apos;m here to assist with questions, analysis, writing, coding, and more.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg w-full">
        {[
          'Explain quantum computing in simple terms',
          'Write a Python script to parse CSV files',
          'Help me write a professional email',
          "What's the difference between REST and GraphQL?",
        ].map((suggestion) => (
          <button
            key={suggestion}
            className="
              text-left p-3 rounded-theme border border-edge hover:border-accent-soft/40
              bg-raised hover:bg-surface text-sm text-t2
              transition-colors
            "
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent('lucy:suggestion', { detail: suggestion })
              );
            }}
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}

/** "..." menu with Export options */
function ExportMenu({
  messages,
  title,
}: {
  messages: ChatMessageType[];
  title: string;
}) {
  const [open, setOpen] = useState(false);

  const exportMarkdown = () => {
    setOpen(false);
    const lines: string[] = [`# ${title}\n`];
    for (const msg of messages) {
      const role = msg.role === 'user' ? '**You**' : '**Lucy**';
      lines.push(`${role}\n\n${msg.content}\n`);
    }
    download(`${slug(title)}.md`, lines.join('\n---\n\n'), 'text/markdown');
  };

  const exportJson = () => {
    setOpen(false);
    const data = JSON.stringify({ title, messages }, null, 2);
    download(`${slug(title)}.json`, data, 'application/json');
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="p-1.5 rounded-md text-t3 hover:text-t2 hover:bg-raised transition-colors"
        title="More options"
        aria-label="Export options"
        aria-expanded={open}
        aria-haspopup="true"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-48 bg-surface border border-edge rounded-theme shadow-xl z-20 py-1">
            <button
              onClick={exportMarkdown}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-t2 hover:text-t1 hover:bg-raised transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Export as Markdown
            </button>
            <button
              onClick={exportJson}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-t2 hover:text-t1 hover:bg-raised transition-colors"
            >
              <FileJson className="w-3.5 h-3.5" />
              Export as JSON
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function slug(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'conversation';
}

function download(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ChatWindow({
  messages,
  streamingContent,
  isStreaming,
  provider,
  modelName,
  conversationTitle = 'Conversation',
  toolChips,
  onEditMessage,
  onRegenerate,
}: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const memoryUsedCount = useMemoryStore((s) => s.lastUsedCount);

  // Auto-scroll to bottom when new content arrives — including when streaming
  // STARTS, so the "Lucy is typing" row is revealed instead of sitting just
  // below the fold under the message the user just sent.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent, isStreaming]);

  const visibleMessages = messages.filter((m) => m.role !== 'system');

  // Running token estimate for this conversation
  const totalTokens = estimateConversationTokens(visibleMessages);

  // Map visible index back to original index in messages array
  // (system messages are filtered out but we need original indices for callbacks)
  const visibleWithIndex = messages
    .map((m, i) => ({ message: m, originalIndex: i }))
    .filter(({ message }) => message.role !== 'system');

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Chat header */}
      {visibleMessages.length > 0 && (
        <div className="flex items-center justify-between px-4 py-1.5 border-b border-edge/50 shrink-0">
          {/* Token counter */}
          <div className="flex items-center gap-1.5 text-xs text-t3">
            <Hash className="w-3 h-3" />
            <span>~{totalTokens.toLocaleString()} tokens this conversation</span>
          </div>
          <ExportMenu messages={visibleMessages} title={conversationTitle} />
        </div>
      )}

      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto"
        role="log"
        aria-live="polite"
        aria-label="Chat messages"
      >
        {visibleMessages.length === 0 && !isStreaming ? (
          <div className="h-full">
            <EmptyState />
          </div>
        ) : (
          <div className="max-w-3xl mx-auto divide-y divide-edge/50">
            {visibleWithIndex.map(({ message, originalIndex }) => (
              <ChatMessage
                key={originalIndex}
                message={message}
                messageIndex={originalIndex}
                provider={message.role === 'assistant' ? provider : undefined}
                modelName={message.role === 'assistant' ? modelName : undefined}
                showTokens={true}
                onEditSave={message.role === 'user' ? onEditMessage : undefined}
                onRegenerate={message.role === 'assistant' ? onRegenerate : undefined}
              />
            ))}

            {/* Tool-call chips — shown while streaming, one chip per tool call */}
            {isStreaming && toolChips && toolChips.length > 0 && (
              <div className="px-4 py-2 flex flex-wrap gap-1.5">
                {toolChips.map((chip, i) => (
                  <span
                    key={i}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${
                      chip.ok === true
                        ? 'bg-green-950/50 border-green-800/60 text-green-300'
                        : chip.ok === false
                        ? 'bg-red-950/50 border-red-800/60 text-red-300'
                        : 'bg-raised/60 border-edge-strong/60 text-t3'
                    }`}
                  >
                    {chip.ok === true ? '✓' : chip.ok === false ? '✗' : '🔧'}
                    {' '}{chip.slug} · {chip.tool}
                  </span>
                ))}
              </div>
            )}

            {/* Streaming message */}
            {isStreaming && (
              <ChatMessage
                message={{ role: 'assistant', content: streamingContent }}
                messageIndex={messages.length}
                provider={provider}
                modelName={modelName}
                isStreaming={true}
              />
            )}
          </div>
        )}
        {!isStreaming && memoryUsedCount > 0 && (
          <div className="max-w-3xl mx-auto px-4 py-1 text-xs text-t3">
            🧠 Lucy used {memoryUsedCount} {memoryUsedCount === 1 ? 'memory' : 'memories'} for context
          </div>
        )}
        <div ref={bottomRef} className="h-4" />
      </div>
    </div>
  );
}
