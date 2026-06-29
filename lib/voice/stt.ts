/**
 * Voice — Speech-to-Text abstraction (client-only).
 *
 * Phase A: browser Web Speech API.
 * Phase B: non-browser providers (openai, deepgram, local) use MediaRecorder
 *          to capture audio as a Blob, then POST to /api/voice/transcribe.
 *
 * Guard: never import this at the module level in a Server Component.
 * All browser API access is deferred to start()/stop() calls or guarded by
 * typeof window checks.
 */

import type { SttProvider } from './types';

// ─── Minimal Web Speech API declarations ─────────────────────────────────────

interface WebSpeechResult {
  readonly transcript: string;
  readonly confidence: number;
}

interface WebSpeechResultItem {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: WebSpeechResult;
}

interface WebSpeechResultList {
  readonly length: number;
  [index: number]: WebSpeechResultItem;
}

interface WebSpeechEvent extends Event {
  readonly resultIndex: number;
  readonly results: WebSpeechResultList;
}

interface WebSpeechErrorEvent extends Event {
  readonly error: string;
}

interface WebSpeechRecognizer extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: WebSpeechEvent) => void) | null;
  onerror: ((event: WebSpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

type WebSpeechRecognizerConstructor = new () => WebSpeechRecognizer;

// ─── Public types ─────────────────────────────────────────────────────────────

export interface SttSessionOptions {
  provider: SttProvider;
  language?: string;
  /** For cloud providers: OpenAI API key (sent as x-openai-key header). */
  apiKey?: string;
  /** For Deepgram: the Deepgram API key (sent as x-deepgram-key header). */
  deepgramKey?: string;
  /** API base URL override (for openai / local providers). */
  baseUrl?: string;
  /** Model override (e.g. 'whisper-1'). */
  model?: string;
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (message: string) => void;
  onEnd: () => void;
}

export interface SttSession {
  start(): void;
  stop(): void;
}

// Typed extension of window for Web Speech API access.
interface WindowWithSpeech {
  SpeechRecognition?: WebSpeechRecognizerConstructor;
  webkitSpeechRecognition?: WebSpeechRecognizerConstructor;
}

// ─── Capability checks ────────────────────────────────────────────────────────

/** Returns true when the browser Web Speech API is available. */
export function sttSupported(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as WindowWithSpeech;
  return typeof w.SpeechRecognition === 'function' || typeof w.webkitSpeechRecognition === 'function';
}

/**
 * Returns true when MediaRecorder + getUserMedia are available.
 * Cloud providers (openai, deepgram, local) require this for audio capture.
 */
export function recordingSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function' &&
    typeof MediaRecorder !== 'undefined'
  );
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function getRecognizerConstructor(): WebSpeechRecognizerConstructor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as WindowWithSpeech;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Cloud recording session using MediaRecorder.
 * Captures audio until stop() is called, then POSTs to /api/voice/transcribe.
 */
function createCloudSession(opts: SttSessionOptions): SttSession {
  let mediaRecorder: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let chunks: Blob[] = [];
  let stopped = false;

  const doTranscribe = async (audioBlob: Blob) => {
    try {
      const form = new FormData();
      form.append('file', audioBlob, 'audio.webm');
      form.append('provider', opts.provider);
      if (opts.model) form.append('model', opts.model);
      if (opts.language) form.append('language', opts.language);
      if (opts.baseUrl) form.append('baseUrl', opts.baseUrl);

      const headers: Record<string, string> = {};
      if (opts.apiKey) headers['x-openai-key'] = opts.apiKey;
      if (opts.deepgramKey) headers['x-deepgram-key'] = opts.deepgramKey;

      const res = await fetch('/api/voice/transcribe', {
        method: 'POST',
        headers,
        body: form,
      });

      const json = await res.json();
      if (!res.ok || json.error) {
        opts.onError(json.error || `Transcription failed (${res.status})`);
        opts.onEnd();
        return;
      }

      if (json.text) opts.onFinal(json.text as string);
      opts.onEnd();
    } catch (err) {
      opts.onError(err instanceof Error ? err.message : 'Transcription request failed');
      opts.onEnd();
    }
  };

  return {
    start() {
      if (typeof window === 'undefined') return;
      stopped = false;
      chunks = [];

      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((ms) => {
          if (stopped) {
            // stop() was called before getUserMedia resolved — release immediately.
            ms.getTracks().forEach((t) => t.stop());
            opts.onEnd();
            return;
          }

          stream = ms;

          // Hint the interim callback so the UI shows a "recording" state.
          opts.onInterim('🎙️ Recording…');

          const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus'
            : MediaRecorder.isTypeSupported('audio/webm')
            ? 'audio/webm'
            : '';

          mediaRecorder = mimeType
            ? new MediaRecorder(ms, { mimeType })
            : new MediaRecorder(ms);

          mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data);
          };

          mediaRecorder.onstop = () => {
            // Release mic tracks.
            stream?.getTracks().forEach((t) => t.stop());
            stream = null;

            if (chunks.length === 0) {
              opts.onEnd();
              return;
            }

            const blob = new Blob(chunks, {
              type: mediaRecorder?.mimeType || 'audio/webm',
            });
            doTranscribe(blob);
          };

          mediaRecorder.start();
        })
        .catch((err) => {
          opts.onError(
            err instanceof Error
              ? `Microphone access denied: ${err.message}`
              : 'Microphone access denied'
          );
          opts.onEnd();
        });
    },

    stop() {
      stopped = true;
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        try {
          mediaRecorder.stop();
        } catch {
          // Already stopped.
        }
      } else {
        // MediaRecorder not yet started (getUserMedia still pending).
        stream?.getTracks().forEach((t) => t.stop());
        stream = null;
      }
    },
  };
}

// ─── Public factory ───────────────────────────────────────────────────────────

/**
 * Create a STT session for the configured provider.
 *
 * - `browser`: uses Web Speech API (live interim + final results).
 * - `openai` / `deepgram` / `local`: records audio via MediaRecorder then
 *   POSTs to /api/voice/transcribe (batch, no interim).
 *
 * Returns null when the required browser APIs are unavailable (the caller
 * should disable the mic button with an appropriate hint).
 */
export function createSttSession(opts: SttSessionOptions): SttSession | null {
  if (typeof window === 'undefined') return null;

  // ── Cloud / local providers → MediaRecorder path ──────────────────────────
  if (opts.provider !== 'browser') {
    if (!recordingSupported()) {
      opts.onError(
        'Microphone recording is not supported in this browser or context. ' +
        'Try a secure context (localhost/HTTPS) in Chrome or Firefox.'
      );
      return null;
    }
    return createCloudSession(opts);
  }

  // ── Browser Web Speech API ─────────────────────────────────────────────────
  const RecognizerCtor = getRecognizerConstructor();
  if (!RecognizerCtor) {
    opts.onError(
      'Web Speech API is not supported in this browser. ' +
      'Try Chrome, Edge, or switch to a cloud STT provider in Settings → Voice.'
    );
    return null;
  }

  const recogniser = new RecognizerCtor();
  recogniser.continuous = true;
  recogniser.interimResults = true;
  recogniser.lang = opts.language || 'en-US';

  // The Web Speech API streams to an online service (Edge → Microsoft,
  // Chrome → Google) that intermittently drops with a transient 'network'
  // error. Silently auto-restart a bounded number of times so a blip doesn't
  // kill the whole recording session; only surface the error if it persists.
  const MAX_NETWORK_RETRIES = 2;
  const RESTART_DELAY_MS = 350;
  let userStopped = false;
  let networkRetries = 0;
  let restarting = false;
  let restartTimer: ReturnType<typeof setTimeout> | null = null;

  recogniser.onresult = (event: WebSpeechEvent) => {
    networkRetries = 0; // healthy stream — replenish the retry budget
    let interimTranscript = '';
    let finalChunk = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const transcript = result[0].transcript;
      if (result.isFinal) {
        finalChunk += transcript;
      } else {
        interimTranscript += transcript;
      }
    }

    if (finalChunk) opts.onFinal(finalChunk);
    if (interimTranscript) opts.onInterim(interimTranscript);
  };

  recogniser.onerror = (event: WebSpeechErrorEvent) => {
    // 'no-speech' / 'aborted' are noisy or user-initiated — swallow silently.
    if (event.error === 'no-speech' || event.error === 'aborted') return;

    // Transient network blip → restart instead of failing (handled in onend,
    // which always fires after onerror). Don't surface anything yet.
    if (event.error === 'network' && !userStopped && networkRetries < MAX_NETWORK_RETRIES) {
      networkRetries++;
      restarting = true;
      return;
    }

    // Map the browser's terse error codes to actionable guidance. Most failures
    // here are environmental (the online speech service), not a Lucy bug.
    const friendly: Record<string, string> = {
      network:
        "Speech service unreachable. The browser's voice recognition needs an online service — " +
        "turn on Windows → Privacy & security → Speech → \"Online speech recognition\", " +
        'or try Google Chrome (more reliable than Edge), or switch STT to a cloud/local provider in Settings → Voice.',
      'service-not-allowed':
        'The browser blocked its speech service. Enable Windows online speech recognition, or use a cloud/local provider in Settings → Voice.',
      'not-allowed':
        'Microphone permission was denied. Allow mic access via the browser address-bar icon, then try again.',
      'audio-capture':
        'No microphone was found. Check that a mic is connected and selected.',
    };
    opts.onError(friendly[event.error] ?? `Mic error: ${event.error}`);
  };

  recogniser.onend = () => {
    // Mid-session restart after a transient network blip — keep going.
    if (restarting && !userStopped) {
      restarting = false;
      restartTimer = setTimeout(() => {
        try {
          recogniser.start();
        } catch {
          // Already running — ignore.
        }
      }, RESTART_DELAY_MS);
      return; // session continues — don't signal end
    }
    opts.onEnd();
  };

  return {
    start() {
      userStopped = false;
      networkRetries = 0;
      restarting = false;
      try {
        recogniser.start();
      } catch {
        // Recogniser already started — safe to ignore.
      }
    },
    stop() {
      userStopped = true;
      restarting = false;
      if (restartTimer) {
        clearTimeout(restartTimer);
        restartTimer = null;
      }
      try {
        recogniser.stop();
      } catch {
        // Already stopped — safe to ignore.
      }
    },
  };
}
