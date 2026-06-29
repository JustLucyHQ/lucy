'use client';

import React, { useState, useCallback } from 'react';
import { Check, Pencil, RefreshCw, X, Volume2, VolumeX } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { TypingIndicator } from '@/components/ui/Spinner';
import { CopyButton } from './CopyButton';
import { estimateTokens } from '@/lib/utils/tokens';
import type { ChatMessage as ChatMessageType } from '@/lib/providers/types';
import type { ProviderName } from '@/lib/providers/types';
import { useSettingsStore } from '@/lib/store/settings';
import { speak, stopSpeaking } from '@/lib/voice/tts';

// Markdown rendering pulls in react-markdown + highlight.js (hundreds of KB).
// Load it as a separate chunk on demand so it stays OUT of the /chat first-load
// bundle — a fresh launch (empty chat / onboarding) never downloads it, which
// is the single biggest win for desktop cold-start.
const MarkdownContent = React.lazy(() => import('./MarkdownContent'));

const PROVIDER_BADGE_VARIANTS: Record<ProviderName, 'info' | 'purple' | 'success' | 'default'> = {
  openai: 'info',
  anthropic: 'purple',
  google: 'success',
  deepseek: 'info',
  groq: 'info',
  mistral: 'purple',
  xai: 'default',
  openrouter: 'success',
  local: 'default',
};

const PROVIDER_LABELS: Record<ProviderName, string> = {
  openai: 'GPT',
  anthropic: 'Claude',
  google: 'Gemini',
  deepseek: 'DeepSeek',
  groq: 'Groq',
  mistral: 'Mistral',
  xai: 'Grok',
  openrouter: 'OpenRouter',
  local: 'Local',
};

interface ChatMessageProps {
  message: ChatMessageType;
  messageIndex: number;
  provider?: ProviderName;
  modelName?: string;
  isStreaming?: boolean;
  showTokens?: boolean;
  /** Called when the user saves an edit — parent handles re-send */
  onEditSave?: (index: number, newContent: string) => void;
  /** Called when the user clicks Regenerate on an assistant message */
  onRegenerate?: (index: number) => void;
}

// ─── Main ChatMessage component ───────────────────────────────────────────────

// Memoized: during SSE streaming the parent re-renders on every chunk, and
// without memo every completed message re-runs its ReactMarkdown parse.
export const ChatMessage = React.memo(function ChatMessage({
  message,
  messageIndex,
  provider,
  modelName,
  isStreaming = false,
  showTokens = false,
  onEditSave,
  onRegenerate,
}: ChatMessageProps) {
  const isAssistant = message.role === 'assistant';
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(message.content);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const voiceTts = useSettingsStore((s) => s.voice.tts);
  const apiKeys = useSettingsStore((s) => s.apiKeys);

  const tokenCount = estimateTokens(message.content);

  const handleEditSave = useCallback(() => {
    const trimmed = editValue.trim();
    if (!trimmed) return;
    onEditSave?.(messageIndex, trimmed);
    setIsEditing(false);
  }, [editValue, messageIndex, onEditSave]);

  const handleEditCancel = useCallback(() => {
    setEditValue(message.content);
    setIsEditing(false);
  }, [message.content]);

  const handleRegenerate = useCallback(() => {
    onRegenerate?.(messageIndex);
  }, [messageIndex, onRegenerate]);

  return (
    <div
      className={`
        flex gap-3 px-4 py-2.5 animate-slide-up group/msg
        ${isAssistant ? 'bg-raised/50 msg-assistant' : 'msg-user'}
      `}
    >
      <Avatar role={message.role === 'user' ? 'user' : 'assistant'} />

      <div className="flex-1 min-w-0">
        {/* Role label (visible in editorial theme via CSS; hidden in others) */}
        <div className="role-label">{isAssistant ? 'Lucy' : 'You'}</div>
        {/* Message header */}
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium text-t2">
            {isAssistant ? 'Lucy' : 'You'}
          </span>
          {isAssistant && provider && (
            <Badge variant={PROVIDER_BADGE_VARIANTS[provider]}>
              {modelName || PROVIDER_LABELS[provider]}
            </Badge>
          )}
        </div>

        {/* Content / edit form */}
        <div className="relative">
          {isEditing ? (
            <div className="flex flex-col gap-2">
              <textarea
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                rows={Math.max(3, editValue.split('\n').length)}
                autoFocus
                className="
                  w-full bg-raised border border-edge-strong rounded-theme
                  px-3 py-2 text-sm text-t1 resize-y
                  focus:outline-none focus:border-lucy-500 focus:ring-1 focus:ring-lucy-500
                "
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleEditSave();
                  }
                  if (e.key === 'Escape') handleEditCancel();
                }}
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleEditSave}
                  className="
                    flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs
                    bg-accent hover:bg-accent-soft text-white transition-colors shadow-glow-sm btn-primary
                  "
                >
                  <Check className="w-3.5 h-3.5" /> Save & Send
                </button>
                <button
                  onClick={handleEditCancel}
                  className="
                    flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs
                    bg-raised hover:bg-raised text-t2 transition-colors
                  "
                >
                  <X className="w-3.5 h-3.5" /> Cancel
                </button>
                <span className="text-xs text-t3 ml-1">Cmd+Enter to save</span>
              </div>
            </div>
          ) : isStreaming && !message.content ? (
            <div className="py-1">
              <TypingIndicator />
            </div>
          ) : (
            <div
              className={`
                prose prose-sm prose-invert max-w-none
                prose-headings:text-gray-100 prose-headings:font-semibold
                prose-p:text-gray-200 prose-p:leading-relaxed
                prose-a:text-lucy-400 prose-a:no-underline hover:prose-a:underline
                prose-strong:text-gray-100
                prose-code:text-lucy-300 prose-code:bg-gray-900 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:before:content-none prose-code:after:content-none
                prose-pre:bg-transparent prose-pre:p-0 prose-pre:border-0 prose-pre:my-0
                prose-blockquote:border-l-lucy-500 prose-blockquote:text-gray-400
                prose-ul:text-gray-200 prose-ol:text-gray-200
                prose-li:text-gray-200
                prose-hr:border-gray-700
                prose-table:text-gray-200
                prose-th:text-gray-100 prose-th:border-gray-700
                prose-td:border-gray-700
              `}
            >
              {/* Until the markdown chunk loads, show the raw text so the message
                  is readable immediately (and streams without a blank flash). */}
              <React.Suspense
                fallback={
                  <div className="whitespace-pre-wrap break-words text-gray-200">
                    {message.content}
                  </div>
                }
              >
                <MarkdownContent content={message.content} />
              </React.Suspense>
              {isStreaming && (
                <span className="inline-block w-1.5 h-4 bg-lucy-400 ml-0.5 animate-pulse align-middle" />
              )}
            </div>
          )}

          {/* Hover action buttons — shown when not editing/streaming */}
          {!isStreaming && !isEditing && message.content && (
            <div className="
              flex items-center gap-1 mt-2
              opacity-0 group-hover/msg:opacity-100 transition-opacity
            ">
              <CopyButton text={message.content} />

              {/* Read-aloud button — assistant messages only, when TTS is enabled */}
              {isAssistant && voiceTts.enabled && (
                <button
                  onClick={() => {
                    if (isSpeaking) {
                      stopSpeaking();
                      setIsSpeaking(false);
                    } else {
                      setIsSpeaking(true);
                      speak(message.content, {
                        provider: voiceTts.provider,
                        voice: voiceTts.voice,
                        speed: voiceTts.speed,
                        model: voiceTts.model,
                        baseUrl: voiceTts.baseUrl,
                        apiKey: apiKeys.openai || undefined,
                        onEnd: () => setIsSpeaking(false),
                      });
                    }
                  }}
                  className="p-1.5 rounded-md text-t3 hover:text-t2 hover:bg-raised transition-colors"
                  title={isSpeaking ? 'Stop reading' : 'Read aloud'}
                  aria-label={isSpeaking ? 'Stop reading aloud' : 'Read message aloud'}
                >
                  {isSpeaking ? (
                    <VolumeX className="w-3.5 h-3.5 text-lucy-400 animate-pulse" />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5" />
                  )}
                </button>
              )}

              {/* Edit button — user messages only */}
              {!isAssistant && onEditSave && (
                <button
                  onClick={() => {
                    setEditValue(message.content);
                    setIsEditing(true);
                  }}
                  className="p-1.5 rounded-md text-t3 hover:text-t2 hover:bg-raised transition-colors"
                  title="Edit message"
                  aria-label="Edit this message"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Regenerate button — assistant messages only */}
              {isAssistant && onRegenerate && (
                <button
                  onClick={handleRegenerate}
                  className="p-1.5 rounded-md text-t3 hover:text-t2 hover:bg-raised transition-colors"
                  title="Regenerate response"
                  aria-label="Regenerate this response"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Token count badge (shown once, in the hover action row) */}
              {showTokens && (
                <span className="text-xs text-t3 ml-1">
                  ~{tokenCount.toLocaleString()} tokens
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
