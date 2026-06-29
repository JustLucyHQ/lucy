'use client';

import React, { useEffect, useState, useRef } from 'react';
import { Mic, Volume2, Info, Key } from 'lucide-react';
import { useSettingsStore } from '@/lib/store/settings';
import { createSttSession, sttSupported, recordingSupported } from '@/lib/voice/stt';
import { speak, stopSpeaking, ttsSupported, waitForVoices } from '@/lib/voice/tts';
import type { SttSession } from '@/lib/voice/stt';
import type { SttProvider, TtsProvider, VoiceOption } from '@/lib/voice/types';

// ─── Small reusable primitives ────────────────────────────────────────────────

function Card({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-5">
      <div className="flex items-center gap-2">
        <span className="text-lucy-400">{icon}</span>
        <h2 className="text-base font-semibold text-white">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4">
      <div className="sm:w-44 shrink-0">
        <span className="text-sm text-gray-300">{label}</span>
        {hint && <p className="text-xs text-gray-500 mt-0.5">{hint}</p>}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-lucy-500 focus:ring-offset-1 focus:ring-offset-gray-900 ${
        checked ? 'bg-lucy-500' : 'bg-gray-700'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

function Select<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-lucy-500 w-full"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: 'text' | 'password';
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-lucy-500"
    />
  );
}

function OpenAIKeyNote() {
  return (
    <p className="flex items-start gap-1.5 text-xs text-gray-400 mt-1">
      <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
      Uses your OpenAI key from{' '}
      <a href="/settings/providers" className="text-lucy-400 hover:underline">
        Settings → Providers
      </a>
      .
    </p>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function VoiceSettingsPage() {
  const { voice, setVoiceStt, setVoiceTts, setVoice, apiKeys } = useSettingsStore();

  // ── Mic test state ────────────────────────────────────────────────────────
  const [micTesting, setMicTesting] = useState(false);
  const [micTranscribing, setMicTranscribing] = useState(false);
  const [micInterim, setMicInterim] = useState('');
  const [micFinal, setMicFinal] = useState('');
  const [micError, setMicError] = useState('');
  const micSessionRef = useRef<SttSession | null>(null);
  const finalAccRef = useRef('');

  // ── TTS state ─────────────────────────────────────────────────────────────
  const [ttsPlaying, setTtsPlaying] = useState(false);
  const [voices, setVoices] = useState<VoiceOption[]>([]);

  // Load browser voices on mount (async population).
  useEffect(() => {
    waitForVoices().then(setVoices);
  }, []);

  // ── Mic test handlers ────────────────────────────────────────────────────

  const isCloudStt = voice.stt.provider !== 'browser';

  const startMicTest = () => {
    finalAccRef.current = '';
    setMicFinal('');
    setMicInterim('');
    setMicError('');
    setMicTranscribing(false);

    const session = createSttSession({
      provider: voice.stt.provider,
      language: voice.stt.language || 'en-US',
      apiKey: apiKeys.openai || undefined,
      deepgramKey: voice.deepgramKey || undefined,
      baseUrl: voice.stt.baseUrl || undefined,
      model: voice.stt.model || undefined,
      onInterim: (t) => {
        if (!isCloudStt) setMicInterim(t);
      },
      onFinal: (t) => {
        setMicTranscribing(false);
        finalAccRef.current += t + ' ';
        setMicFinal(finalAccRef.current);
        setMicInterim('');
      },
      onError: (msg) => {
        setMicError(msg);
        setMicTesting(false);
        setMicTranscribing(false);
        micSessionRef.current = null;
      },
      onEnd: () => {
        setMicTesting(false);
        setMicTranscribing(false);
        micSessionRef.current = null;
      },
    });

    if (!session) {
      const msg = isCloudStt
        ? 'Microphone recording not available. Use a secure context (localhost/HTTPS).'
        : 'Web Speech API is not supported in this browser. Try Chrome or Edge.';
      setMicError(msg);
      return;
    }

    micSessionRef.current = session;
    session.start();
    setMicTesting(true);
  };

  const stopMicTest = () => {
    if (isCloudStt) {
      // For cloud: stop triggers recording→transcription. Show transcribing state.
      micSessionRef.current?.stop();
      micSessionRef.current = null;
      setMicTesting(false);
      setMicTranscribing(true);
    } else {
      micSessionRef.current?.stop();
      micSessionRef.current = null;
      setMicTesting(false);
    }
  };

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      micSessionRef.current?.stop();
      stopSpeaking();
    };
  }, []);

  // ── TTS test handler ─────────────────────────────────────────────────────

  const isCloudTts = voice.tts.provider !== 'browser';

  const testTts = () => {
    if (ttsPlaying) {
      stopSpeaking();
      setTtsPlaying(false);
      return;
    }
    if (!isCloudTts && !ttsSupported()) {
      return;
    }
    setTtsPlaying(true);
    speak("Hi! I'm Lucy. Your voice is working perfectly.", {
      provider: voice.tts.provider,
      voice: voice.tts.voice,
      speed: voice.tts.speed,
      model: voice.tts.model,
      baseUrl: voice.tts.baseUrl,
      apiKey: apiKeys.openai || undefined,
      onEnd: () => setTtsPlaying(false),
    });
  };

  // ── STT provider options ──────────────────────────────────────────────────
  const sttProviderOptions: { value: SttProvider; label: string }[] = [
    { value: 'browser', label: 'Browser (Web Speech)' },
    { value: 'openai', label: 'OpenAI Whisper' },
    { value: 'deepgram', label: 'Deepgram Nova-2' },
    { value: 'local', label: 'Whisper (Local)' },
  ];

  const ttsProviderOptions: { value: TtsProvider; label: string }[] = [
    { value: 'browser', label: 'Browser (speechSynthesis)' },
    { value: 'openai', label: 'OpenAI TTS' },
    { value: 'local', label: 'Local (OpenAI-compatible)' },
  ];

  // For browser TTS show system voices; for openai/local show OpenAI voice names.
  const OPENAI_VOICES = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse'];
  const voiceOptions = isCloudTts
    ? [
        { value: 'default', label: 'Default (alloy)' },
        ...OPENAI_VOICES.map((v) => ({ value: v, label: v })),
      ]
    : [
        { value: 'default', label: 'Default system voice' },
        ...voices.map((v) => ({ value: v.name, label: `${v.name} (${v.lang})` })),
      ];

  const showSttOpenAINote = voice.stt.provider === 'openai';
  const showSttDeepgramKey = voice.stt.provider === 'deepgram';
  const showSttUrlFields = voice.stt.provider === 'openai' || voice.stt.provider === 'local';
  const showTtsOpenAINote = voice.tts.provider === 'openai';
  const showTtsUrlFields = voice.tts.provider === 'openai' || voice.tts.provider === 'local';

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold text-white">Voice</h1>
        <p className="text-sm text-gray-400 mt-1">
          Configure microphone input (speech-to-text) and read-aloud (text-to-speech).
        </p>
      </div>

      {/* ── Speech to Text ─────────────────────────────────────────────────── */}
      <Card title="Speech to Text" icon={<Mic className="w-4 h-4" />}>
        <Row label="Enable" hint="Show mic button in chat">
          <Toggle
            checked={voice.stt.enabled}
            onChange={(v) => setVoiceStt({ enabled: v })}
            label="Enable speech to text"
          />
        </Row>

        <Row label="Provider">
          <Select
            value={voice.stt.provider}
            onChange={(v) => setVoiceStt({ provider: v })}
            options={sttProviderOptions}
          />
          {showSttOpenAINote && <OpenAIKeyNote />}
        </Row>

        {/* Deepgram API key — only shown when provider = deepgram */}
        {showSttDeepgramKey && (
          <Row label="Deepgram Key" hint="Your Deepgram API key">
            <TextInput
              type="password"
              value={voice.deepgramKey ?? ''}
              onChange={(v) => setVoice({ deepgramKey: v || undefined })}
              placeholder="dg_••••••••"
            />
            <p className="flex items-start gap-1.5 text-xs text-gray-500 mt-1">
              <Key className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              Stored locally in your browser. Never sent to Lucy&apos;s servers except as a per-request header.
            </p>
          </Row>
        )}

        <Row label="Default Language" hint="BCP-47 tag, e.g. en-US">
          <TextInput
            value={voice.stt.language ?? 'en-US'}
            onChange={(v) => setVoiceStt({ language: v })}
            placeholder="en-US"
          />
        </Row>

        {showSttUrlFields && (
          <>
            <Row label="Base URL" hint="API endpoint override">
              <TextInput
                value={voice.stt.baseUrl ?? ''}
                onChange={(v) => setVoiceStt({ baseUrl: v || undefined })}
                placeholder={voice.stt.provider === 'local' ? 'http://localhost:5004/v1' : 'https://api.openai.com/v1'}
              />
            </Row>
            <Row label="Model" hint={voice.stt.provider === 'local' ? 'e.g. Systran/faster-whisper-base.en' : 'e.g. whisper-1'}>
              <TextInput
                value={voice.stt.model ?? ''}
                onChange={(v) => setVoiceStt({ model: v || undefined })}
                placeholder={voice.stt.provider === 'local' ? 'Systran/faster-whisper-base.en' : 'whisper-1'}
              />
            </Row>
            {voice.stt.provider === 'local' && (
              <p className="flex items-start gap-1.5 text-xs text-gray-400">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                Run a local Whisper server with{' '}
                <code className="text-lucy-300">docker compose -f docker-compose.whisper.yml up -d</code>{' '}
                — offline, no API key. See the deployment docs.
              </p>
            )}
          </>
        )}

        {/* Microphone test */}
        <Row label="Test microphone">
          <div className="space-y-2">
            <button
              type="button"
              onClick={micTesting ? stopMicTest : startMicTest}
              disabled={
                micTranscribing ||
                (voice.stt.provider === 'browser' ? !sttSupported() : !recordingSupported())
              }
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                micTesting
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : micTranscribing
                  ? 'bg-gray-700 text-lucy-400 animate-pulse disabled:cursor-not-allowed'
                  : 'bg-gray-700 hover:bg-gray-600 text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed'
              }`}
            >
              <Mic className={`w-4 h-4 ${micTesting || micTranscribing ? 'animate-pulse' : ''}`} />
              {micTranscribing
                ? 'Transcribing…'
                : micTesting
                ? isCloudStt
                  ? 'Stop & transcribe'
                  : 'Stop listening'
                : isCloudStt
                ? 'Start recording'
                : 'Start listening'}
            </button>

            {voice.stt.provider === 'browser' && !sttSupported() && (
              <p className="text-xs text-amber-400/80">
                Web Speech API is not supported in this browser. Try Chrome or Edge.
              </p>
            )}

            {voice.stt.provider !== 'browser' && !recordingSupported() && (
              <p className="text-xs text-amber-400/80">
                Audio recording requires a secure context (localhost/HTTPS) and a modern browser.
              </p>
            )}

            {micError && (
              <p className="text-xs text-red-400">{micError}</p>
            )}

            {(micFinal || micInterim) && (
              <div className="mt-2 p-3 rounded-lg bg-gray-800 border border-gray-700 text-sm text-gray-200 min-h-[2.5rem]">
                {micFinal}
                {micInterim && (
                  <span className="text-gray-500 italic">{micInterim}</span>
                )}
              </div>
            )}
          </div>
        </Row>
      </Card>

      {/* ── Text to Speech ─────────────────────────────────────────────────── */}
      <Card title="Text to Speech" icon={<Volume2 className="w-4 h-4" />}>
        <Row label="Enable" hint="Show speaker button on messages">
          <Toggle
            checked={voice.tts.enabled}
            onChange={(v) => setVoiceTts({ enabled: v })}
            label="Enable text to speech"
          />
        </Row>

        <Row label="Provider">
          <Select
            value={voice.tts.provider}
            onChange={(v) => setVoiceTts({ provider: v })}
            options={ttsProviderOptions}
          />
          {showTtsOpenAINote && <OpenAIKeyNote />}
        </Row>

        <Row label="Voice">
          <Select
            value={voice.tts.voice}
            onChange={(v) => setVoiceTts({ voice: v })}
            options={voiceOptions}
          />
        </Row>

        <Row label="Speed" hint={`${voice.tts.speed.toFixed(1)}×`}>
          <input
            type="range"
            min={0.5}
            max={2}
            step={0.1}
            value={voice.tts.speed}
            onChange={(e) => setVoiceTts({ speed: parseFloat(e.target.value) })}
            className="w-full accent-lucy-500"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>0.5×</span>
            <span>1.0×</span>
            <span>2.0×</span>
          </div>
        </Row>

        <Row label="Auto-read" hint="Speak each completed reply">
          <Toggle
            checked={voice.tts.autoRead}
            onChange={(v) => setVoiceTts({ autoRead: v })}
            label="Auto-read assistant replies"
          />
        </Row>

        {showTtsUrlFields && (
          <>
            <Row label="Base URL" hint="API endpoint override">
              <TextInput
                value={voice.tts.baseUrl ?? ''}
                onChange={(v) => setVoiceTts({ baseUrl: v || undefined })}
                placeholder="https://api.openai.com/v1"
              />
            </Row>
            <Row label="Model" hint="e.g. tts-1">
              <TextInput
                value={voice.tts.model ?? ''}
                onChange={(v) => setVoiceTts({ model: v || undefined })}
                placeholder="tts-1"
              />
            </Row>
          </>
        )}

        <Row label="Test voice">
          <div className="space-y-2">
            {!isCloudTts && !ttsSupported() && (
              <p className="text-xs text-amber-400/80">
                speechSynthesis is not supported in this browser.
              </p>
            )}
            <button
              type="button"
              onClick={testTts}
              disabled={!isCloudTts && !ttsSupported()}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                ttsPlaying
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-gray-700 hover:bg-gray-600 text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed'
              }`}
            >
              <Volume2 className={`w-4 h-4 ${ttsPlaying ? 'animate-pulse' : ''}`} />
              {ttsPlaying ? 'Stop' : 'Test voice'}
            </button>
          </div>
        </Row>
      </Card>
    </div>
  );
}
