/**
 * Voice — Text-to-Speech abstraction (client-only).
 *
 * Phase A: browser speechSynthesis.
 * Phase B: cloud/local providers POST to /api/voice/speak and play the
 *          returned audio via an Audio element.
 *
 * Guard: never import this at the module level in a Server Component.
 */

import type { TtsProvider, VoiceOption } from './types';

export interface SpeakOptions {
  provider?: TtsProvider;
  voice?: string;
  speed?: number;
  /** For openai / local: OpenAI API key (sent as x-openai-key header). */
  apiKey?: string;
  /** API base URL override (for openai / local providers). */
  baseUrl?: string;
  /** Model override (e.g. 'tts-1'). */
  model?: string;
  onEnd?: () => void;
}

// ─── Module-level state ───────────────────────────────────────────────────────

/** Currently playing Audio element (cloud path). */
let _currentAudio: HTMLAudioElement | null = null;
/** Currently playing audio blob URL — revoke when done. */
let _currentBlobUrl: string | null = null;

// ─── Capability checks ────────────────────────────────────────────────────────

/** Returns true when browser speechSynthesis is available. */
export function ttsSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window
  );
}

// ─── Main speak function ──────────────────────────────────────────────────────

/**
 * Speak text using the configured provider.
 * Cancels any in-progress speech before starting.
 */
export function speak(text: string, opts?: SpeakOptions): void {
  if (typeof window === 'undefined') return;
  if (!text.trim()) return;

  const provider = opts?.provider ?? 'browser';

  // Stop any existing playback (both browser and cloud paths).
  stopSpeaking();

  if (provider === 'browser') {
    _speakBrowser(text, opts);
    return;
  }

  // Cloud / local path — POST to /api/voice/speak.
  _speakCloud(text, opts ?? {});
}

// ─── Browser path ─────────────────────────────────────────────────────────────

function _speakBrowser(text: string, opts?: SpeakOptions): void {
  if (!ttsSupported()) return;
  const synth = window.speechSynthesis;

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = opts?.speed ?? 1;

  const voiceName = opts?.voice;
  if (voiceName && voiceName !== 'default') {
    const voices = synth.getVoices();
    const match = voices.find((v) => v.name === voiceName);
    if (match) utterance.voice = match;
  }

  if (opts?.onEnd) {
    utterance.onend = opts.onEnd;
  }

  synth.speak(utterance);
}

// ─── Cloud / local path ───────────────────────────────────────────────────────

async function _speakCloud(text: string, opts: SpeakOptions): Promise<void> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (opts.apiKey) headers['x-openai-key'] = opts.apiKey;

    const res = await fetch('/api/voice/speak', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        text,
        provider: opts.provider ?? 'openai',
        voice: opts.voice && opts.voice !== 'default' ? opts.voice : undefined,
        speed: opts.speed,
        model: opts.model,
        baseUrl: opts.baseUrl,
      }),
    });

    if (!res.ok) {
      // Non-fatal — log and call onEnd so the caller's state resets.
      console.error('[voice/tts] speak failed:', res.status);
      opts.onEnd?.();
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);

    _currentBlobUrl = url;
    const audio = new Audio(url);
    _currentAudio = audio;

    audio.onended = () => {
      _cleanup();
      opts.onEnd?.();
    };

    audio.onerror = () => {
      _cleanup();
      opts.onEnd?.();
    };

    await audio.play();
  } catch (err) {
    console.error('[voice/tts] cloud speak error:', err instanceof Error ? err.message : err);
    opts.onEnd?.();
  }
}

function _cleanup() {
  if (_currentBlobUrl) {
    URL.revokeObjectURL(_currentBlobUrl);
    _currentBlobUrl = null;
  }
  _currentAudio = null;
}

// ─── Stop ─────────────────────────────────────────────────────────────────────

/** Cancel any in-progress speech immediately (both browser and cloud). */
export function stopSpeaking(): void {
  // Browser path.
  if (ttsSupported()) {
    window.speechSynthesis.cancel();
  }

  // Cloud path.
  if (_currentAudio) {
    try {
      _currentAudio.pause();
      _currentAudio.src = '';
    } catch {
      // Ignore.
    }
    _cleanup();
  }
}

// ─── Voice list helpers ───────────────────────────────────────────────────────

/**
 * List available browser voices.
 * Note: the list may be populated asynchronously; call this inside useEffect
 * or after a `voiceschanged` event.
 */
export function listVoices(): VoiceOption[] {
  if (!ttsSupported()) return [];
  return window.speechSynthesis.getVoices().map((v) => ({
    name: v.name,
    lang: v.lang,
    default: v.default,
  }));
}

/**
 * Returns a promise that resolves to the voice list once populated.
 * Resolves immediately if voices are already available.
 */
export function waitForVoices(): Promise<VoiceOption[]> {
  return new Promise((resolve) => {
    if (!ttsSupported()) {
      resolve([]);
      return;
    }
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      resolve(voices.map((v) => ({ name: v.name, lang: v.lang, default: v.default })));
      return;
    }
    window.speechSynthesis.onvoiceschanged = () => {
      resolve(
        window.speechSynthesis.getVoices().map((v) => ({
          name: v.name,
          lang: v.lang,
          default: v.default,
        }))
      );
    };
  });
}
