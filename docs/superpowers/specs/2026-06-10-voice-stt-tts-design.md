# Voice — Speech-to-Text + Text-to-Speech — Design Spec

**Status:** Approved (design) · **Date:** 2026-06-10 · **Owner:** Johnny
**Umbrella:** `2026-06-09-lucy-design-overhaul-vision.md` (sub-project #4) · **Branch:** `feat/voice`

## Goal

Give Lucy voice — a working **mic** (speech → text into the chat box) and **read-aloud**
(text → speech for replies) — with a Wayland-style provider matrix. Lucy is a browser app, so
the **browser Web Speech API** is the default (instant, no key); cloud + local providers are
selectable, mirroring Wayland's STT/TTS panels.

## Decisions (resolved with the user — "full Wayland parity")
- **STT providers:** `browser` (Web Speech — default, instant, no key) · `openai` (Whisper API) ·
  `deepgram` (Nova-2) · `local` (OpenAI-compatible `/v1/audio/transcriptions`, e.g. whisper.cpp).
- **TTS providers:** `browser` (speechSynthesis — default, local) · `openai` (tts-1) ·
  `local` (OpenAI-compatible `/v1/audio/speech`, e.g. Kokoro).
- **Keys stay server-side:** cloud STT/TTS go through Next route handlers using the server-side
  key (reuse the OpenAI key; a new Deepgram key field). Browser providers run client-side, no key.
- **Voice config** lives in the persisted `useSettingsStore` (per-device preference), not the DB.

## Architecture

**Data — `lib/store/settings.ts`** gains a `voice` slice:
```ts
interface VoiceConfig {
  stt: { enabled: boolean; provider: 'browser'|'openai'|'deepgram'|'local';
         baseUrl?: string; model?: string; language?: string };
  tts: { enabled: boolean; provider: 'browser'|'openai'|'local';
         voice: string; speed: number; autoRead: boolean; baseUrl?: string; model?: string };
  deepgramKey?: string;   // only Deepgram needs a key Lucy doesn't already hold
}
```
Defaults: STT `browser`, TTS `browser`, speed `1`, autoRead `false`, both `enabled:false` until the
user turns them on (matching Wayland's toggles).

**`lib/voice/`**
- `types.ts` — `SttProvider`, `TtsProvider`, `VoiceConfig`, result types.
- `stt.ts` — client STT abstraction. `browser` uses `webkitSpeechRecognition` (interim + final
  results, callback-based). `openai`/`deepgram`/`local` capture audio with `MediaRecorder` → POST
  the blob to `/api/voice/transcribe` → return the transcript.
- `tts.ts` — client TTS abstraction. `browser` uses `speechSynthesis.speak()` (with voice + rate).
  `openai`/`local` POST text to `/api/voice/speak` → receive audio → play via an `Audio` element.

**Route handlers (keys server-side)**
- `app/api/voice/transcribe/route.ts` — POST multipart audio + `{provider, model?, language?, baseUrl?}`.
  `openai`/`local` → OpenAI SDK `audio.transcriptions.create` (baseURL overridable); `deepgram` →
  Deepgram prerecorded API with the stored key. Returns `{ text }`. Auth via `resolveMemoryAuth`.
- `app/api/voice/speak/route.ts` — POST `{text, provider, voice, speed, model?, baseUrl?}` →
  OpenAI/local `audio.speech.create` → stream back `audio/mpeg`. Auth required.

**UI**
- **`/settings/voice`** (new settings section; add **Voice** + a `Mic` icon to `SettingsNav`,
  between Memory and API Access). Two cards mirroring Wayland:
  - *Speech to Text*: enable toggle · Provider dropdown · (for cloud) a key hint linking to
    Providers · Base URL · Model · Default Language · a "Speak to test your microphone" tester.
  - *Text to Speech*: enable toggle · Provider dropdown · Voice · Speed slider (0.5×–2×) ·
    Auto-read toggle · "Test voice" button.
- **`components/chat/ChatInput.tsx`** — replace the disabled mic affordance with a **working mic
  button**: when STT is enabled, click → start the selected STT provider → interim transcript shows
  live in the textarea, final transcript stays; click again (or auto-stop on silence) to stop.
  Disabled state when `stt.enabled` is false (links to /settings/voice).
- **Read-aloud** — a small speaker button on each assistant message (`ChatMessage`/`ChatWindow`)
  → `tts.speak(text)`; plus **auto-read**: when `tts.autoRead` is on, speak each completed
  assistant reply automatically.

## Phasing (build order — mic works after Phase A)
- **Phase A — Browser voice + settings (the usable core):** the `voice` store slice, `lib/voice/*`
  with the **browser** providers wired, the `/settings/voice` UI + nav entry, the working mic button
  in ChatInput (browser STT), and read-aloud + auto-read (browser TTS). *Mic + read-aloud work with
  zero keys, in Edge/Chrome.*
- **Phase B — Cloud + local providers:** `/api/voice/transcribe` + `/api/voice/speak`, the
  `MediaRecorder` capture path in `stt.ts`/`tts.ts`, and wiring OpenAI Whisper + OpenAI TTS +
  Deepgram + local (OpenAI-compatible base URL) into the provider dropdowns. *Full parity.*

## Security / notes
- Browser STT streams audio to the browser vendor's speech service (Edge → Microsoft) — documented
  in the UI; the `local` provider is the fully-private option.
- Cloud keys never reach the client (transcribe/speak routes hold them); Deepgram key stored like
  other secrets (masked on read). Mic access requires user permission (browser prompt) + a secure
  context (localhost/HTTPS — satisfied by the dev server).
- `webkitSpeechRecognition` is Chromium/Edge/Safari; on unsupported browsers the mic button falls
  back to the `MediaRecorder` + cloud path (or is disabled with a hint).

## Testing
- Manual: enable STT (browser) → mic button → speak → words appear in the box → send. Enable TTS →
  Test voice → hear it; auto-read on → a reply is spoken. Switch STT to OpenAI (with key) → speak →
  transcript. Unit: the provider-selection + the transcribe/speak route request shaping.
- `npx tsc --noEmit`, `npm run build` green per phase.

## Excluded / deferred
- Local model **download/management** UI (Wayland's "Download Model") — we accept a base URL to an
  already-running local server; bundled model download is later.
- Streaming/real-time cloud STT (Deepgram live socket) — Phase B uses batch/prerecorded.
- Wake-word / always-listening; voice-activity auto-send.
