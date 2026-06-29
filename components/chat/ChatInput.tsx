'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Send, Square, Mic, MicOff } from 'lucide-react';
import { ModelSelector } from './ModelSelector';
import { PersonaSelector } from './PersonaSelector';
import { getCommandSuggestions, type SlashCommand } from '@/lib/chat/slash-commands';
import type { ProviderName } from '@/lib/providers/types';
import { useSettingsStore } from '@/lib/store/settings';
import { createSttSession, sttSupported, recordingSupported } from '@/lib/voice/stt';
import type { SttSession } from '@/lib/voice/stt';

interface ChatInputProps {
  onSend: (message: string) => void;
  onStop?: () => void;
  isLoading: boolean;
  selectedModel: string;
  onModelChange: (modelId: string, provider: ProviderName) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({
  onSend,
  onStop,
  isLoading,
  selectedModel,
  onModelChange,
  disabled = false,
  placeholder = 'Message Lucy...',
}: ChatInputProps) {
  const [value, setValue] = useState('');
  const [highlight, setHighlight] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Voice / mic state ──────────────────────────────────────────────────────
  const voice = useSettingsStore((s) => s.voice);
  const apiKeys = useSettingsStore((s) => s.apiKeys);
  const [isRecording, setIsRecording] = useState(false);
  const [micError, setMicError] = useState('');
  const sttSessionRef = useRef<SttSession | null>(null);
  // Accumulates final STT chunks so they append correctly between calls.
  const sttBaseRef = useRef('');
  // For cloud providers: track whether we're currently uploading the recording.
  const [isTranscribing, setIsTranscribing] = useState(false);

  // Slash-command autocomplete: shown while typing a bare command token.
  const suggestions = dismissed ? [] : getCommandSuggestions(value);
  const showMenu = suggestions.length > 0 && !isLoading && !disabled;

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }, [value]);

  // Focus on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const changeValue = (next: string) => {
    setValue(next);
    setDismissed(false);
    setHighlight(0);
  };

  // ── Mic handlers ───────────────────────────────────────────────────────────

  const handleMicClick = useCallback(() => {
    const isCloudProvider = voice.stt.provider !== 'browser';

    if (isRecording) {
      // Stop recording.
      // For cloud providers: stop() triggers the onstop → transcription flow;
      // setIsTranscribing will be set true by onInterim's final state + onFinal.
      sttSessionRef.current?.stop();
      sttSessionRef.current = null;
      setIsRecording(false);
      if (isCloudProvider) {
        // For cloud: clear the "🎙️ Recording…" hint from the box while we wait.
        setValue(sttBaseRef.current);
        setIsTranscribing(true);
      } else {
        sttBaseRef.current = '';
      }
      return;
    }

    setMicError('');
    // Snapshot current value so appended STT chunks don't race with existing text.
    sttBaseRef.current = value;

    const session = createSttSession({
      provider: voice.stt.provider,
      language: voice.stt.language || 'en-US',
      // Pass API keys for cloud providers.
      apiKey: apiKeys.openai || undefined,
      deepgramKey: voice.deepgramKey || undefined,
      baseUrl: voice.stt.baseUrl || undefined,
      model: voice.stt.model || undefined,
      onInterim: (interim) => {
        if (isCloudProvider) {
          // Cloud: the only interim is the recording hint — don't append to textarea.
          // (We could show it as a placeholder but keeping the box clean is cleaner.)
          return;
        }
        // Browser: show base + committed finals + current interim (grey preview).
        setValue(sttBaseRef.current + interim);
      },
      onFinal: (chunk) => {
        setIsTranscribing(false);
        // Commit the final chunk into the base accumulator.
        sttBaseRef.current = sttBaseRef.current + chunk + ' ';
        setValue(sttBaseRef.current);
      },
      onError: (msg) => {
        setMicError(msg);
        setIsRecording(false);
        setIsTranscribing(false);
        sttSessionRef.current = null;
        // Restore value to the pre-recording base so partial interim text is dropped.
        setValue(sttBaseRef.current);
        sttBaseRef.current = '';
      },
      onEnd: () => {
        setIsRecording(false);
        setIsTranscribing(false);
        sttSessionRef.current = null;
        sttBaseRef.current = '';
      },
    });

    if (!session) {
      const msg = isCloudProvider
        ? 'Microphone recording not available. Use a secure context (localhost/HTTPS).'
        : 'Web Speech API not available. Enable mic in Settings → Voice.';
      setMicError(msg);
      return;
    }

    sttSessionRef.current = session;
    session.start();
    setIsRecording(true);
  }, [isRecording, value, voice.stt.provider, voice.stt.language, voice.stt.baseUrl, voice.stt.model, voice.deepgramKey, apiKeys]);

  // Stop recording when the component unmounts.
  useEffect(() => {
    return () => {
      sttSessionRef.current?.stop();
    };
  }, []);

  const applyCommand = (cmd: SlashCommand) => {
    if (cmd.argHint) {
      // Arg-command: prime the input and let the user type the argument.
      changeValue(`/${cmd.name} `);
      setDismissed(true); // the trailing space already hides the menu; keep it closed
      textareaRef.current?.focus();
    } else {
      // No-arg command: fire immediately.
      onSend(`/${cmd.name}`);
      setValue('');
      setDismissed(false);
      setHighlight(0);
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMenu) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlight((h) => (h + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        applyCommand(suggestions[Math.min(highlight, suggestions.length - 1)]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setDismissed(true);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed || isLoading || disabled) return;
    onSend(trimmed);
    setValue('');
    setDismissed(false);
    setHighlight(0);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  return (
    <div className="border-t border-edge-strong bg-surface p-3 sm:p-4">
      <div className="max-w-3xl mx-auto">
        <form
          role="form"
          aria-label="Chat input"
          onSubmit={(e) => { e.preventDefault(); handleSend(); }}
          className="relative flex flex-col bg-raised border border-edge-strong rounded-theme focus-within:border-edge transition-colors"
        >
          {/* Slash-command autocomplete menu */}
          {showMenu && (
            <ul
              role="listbox"
              aria-label="Commands"
              className="absolute bottom-full left-0 right-0 mb-2 max-h-64 overflow-y-auto rounded-theme border border-edge-strong bg-surface shadow-xl py-1 z-20"
            >
              {suggestions.map((cmd, i) => (
                <li
                  key={cmd.name}
                  role="option"
                  aria-selected={i === highlight}
                  onMouseDown={(e) => {
                    // mousedown fires before blur so the click isn't lost
                    e.preventDefault();
                    applyCommand(cmd);
                  }}
                  onMouseEnter={() => setHighlight(i)}
                  className={`flex items-baseline gap-2 px-3 py-1.5 cursor-pointer ${
                    i === highlight ? 'bg-raised' : 'hover:bg-raised/60'
                  }`}
                >
                  <span className="font-mono text-sm text-lucy-300">{cmd.label}</span>
                  {cmd.argHint && (
                    <span className="font-mono text-xs text-gray-500">&lt;{cmd.argHint}&gt;</span>
                  )}
                  <span className="ml-auto text-xs text-gray-400 truncate">{cmd.description}</span>
                </li>
              ))}
            </ul>
          )}

          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => changeValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={1}
            disabled={disabled || isLoading}
            aria-label="Message input"
            aria-multiline="true"
            className="
              w-full bg-transparent resize-none outline-none
              px-4 pt-3 pb-2 text-sm text-t1 placeholder-t3
              min-h-[44px] max-h-[200px]
              disabled:opacity-50
            "
          />

          {/* Bottom bar: persona + model + send */}
          <div className="flex items-center justify-between px-3 pb-2 pt-1 gap-2 flex-wrap sm:flex-nowrap">
            <div className="flex items-center gap-2 min-w-0">
              {/* Persona selector chip */}
              <PersonaSelector />

              {/* Model selector — smaller on mobile */}
              <ModelSelector
                selectedModel={selectedModel}
                onModelChange={onModelChange}
                className="text-xs"
              />
            </div>

            <div className="relative flex items-center gap-2 shrink-0">
              <span className="text-xs text-t3 hidden sm:block">
                {value.length > 0 ? (
                  <span>{showMenu ? '↑↓ to pick · Enter to apply' : 'Shift+Enter for newline'}</span>
                ) : (
                  <span>Type / for commands</span>
                )}
              </span>

              {isLoading ? (
                <button
                  type="button"
                  onClick={onStop}
                  className="p-2 rounded-lg bg-raised hover:bg-surface text-t2 transition-colors"
                  title="Stop generating"
                  aria-label="Stop generating response"
                >
                  <Square className="w-4 h-4" />
                </button>
              ) : (
                <>
                  {/* Mic button */}
                  {!voice.stt.enabled ? (
                    <a
                      href="/settings/voice"
                      title="Enable voice in Settings → Voice"
                      aria-label="Voice disabled — click to open voice settings"
                      className="p-2 rounded-lg text-t3 hover:text-t2 transition-colors"
                    >
                      <MicOff className="w-4 h-4" />
                    </a>
                  ) : voice.stt.provider === 'browser' && !sttSupported() ? (
                    // Browser provider but no Web Speech API available.
                    <button
                      type="button"
                      disabled
                      title="Web Speech API not supported in this browser. Switch to a cloud STT provider in Settings → Voice."
                      aria-label="Microphone not supported"
                      className="p-2 rounded-lg text-t3 cursor-not-allowed"
                    >
                      <MicOff className="w-4 h-4" />
                    </button>
                  ) : voice.stt.provider !== 'browser' && !recordingSupported() ? (
                    // Cloud provider but no MediaRecorder / getUserMedia.
                    <button
                      type="button"
                      disabled
                      title="Audio recording not supported in this context"
                      aria-label="Microphone recording not supported"
                      className="p-2 rounded-lg text-t3 cursor-not-allowed"
                    >
                      <MicOff className="w-4 h-4" />
                    </button>
                  ) : isTranscribing ? (
                    // Cloud provider: transcription in progress.
                    <button
                      type="button"
                      disabled
                      title="Transcribing…"
                      aria-label="Transcribing audio"
                      className="p-2 rounded-lg text-lucy-400 animate-pulse cursor-not-allowed"
                    >
                      <Mic className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleMicClick}
                      disabled={isLoading}
                      title={isRecording ? 'Stop recording' : 'Start voice input'}
                      aria-label={isRecording ? 'Stop recording' : 'Start voice input'}
                      className={`p-2 rounded-lg transition-colors ${
                        isLoading
                          ? 'text-t3 cursor-not-allowed'
                          : isRecording
                          ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse'
                          : 'text-t3 hover:text-t2 hover:bg-raised'
                      }`}
                    >
                      <Mic className="w-4 h-4" />
                    </button>
                  )}

                  {/* Mic error tooltip (auto-clears after 4 s) */}
                  {micError && (
                    <span className="absolute bottom-full mb-2 right-14 max-w-xs text-xs text-red-300 bg-surface border border-red-800 rounded-theme px-2 py-1 shadow-xl z-30 pointer-events-none">
                      {micError}
                    </span>
                  )}

                  <button
                    type="submit"
                    disabled={!value.trim() || disabled}
                    className="
                      p-2 rounded-lg bg-accent hover:bg-accent-soft
                      text-white transition-colors shadow-glow-sm btn-primary
                      disabled:opacity-40 disabled:cursor-not-allowed
                    "
                    title="Send message"
                    aria-label="Send message"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          </div>
        </form>

        <p className="text-center text-xs text-t3 mt-2">
          Lucy can make mistakes. Consider checking important information.
        </p>
      </div>
    </div>
  );
}
