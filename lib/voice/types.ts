/**
 * Voice feature — shared types.
 * Used by both the store slice and the browser STT/TTS helpers.
 */

export type SttProvider = 'browser' | 'openai' | 'deepgram' | 'local';
export type TtsProvider = 'browser' | 'openai' | 'local';

export interface VoiceConfig {
  stt: {
    enabled: boolean;
    provider: SttProvider;
    /** BCP-47 language tag, e.g. 'en-US'. Defaults to 'en-US'. */
    language?: string;
    /** For openai/local: API base URL override. */
    baseUrl?: string;
    /** For openai/local: model name override (e.g. 'whisper-1'). */
    model?: string;
  };
  tts: {
    enabled: boolean;
    provider: TtsProvider;
    /** Voice name, e.g. 'Google US English' or 'alloy'. 'default' = no override. */
    voice: string;
    /** Playback speed multiplier. Range 0.5–2. Default 1. */
    speed: number;
    /** Automatically read each completed assistant reply aloud. */
    autoRead: boolean;
    /** For openai/local: API base URL override. */
    baseUrl?: string;
    /** For openai/local: model name override (e.g. 'tts-1'). */
    model?: string;
  };
  /** Deepgram API key (stored client-side; only Deepgram needs a key Lucy doesn't hold). */
  deepgramKey?: string;
}

/** Minimal voice object returned by the browser speechSynthesis API. */
export interface VoiceOption {
  name: string;
  lang: string;
  default: boolean;
}
