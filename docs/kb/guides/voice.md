# Voice

Lucy speaks and listens. Voice has two independent halves:

- **Speech-to-text (STT)** — talk into the mic in the chat bar; your words land in the input box.
- **Text-to-speech (TTS)** — read any of Lucy's replies aloud, on demand or automatically.

Both are configured in **Settings → Voice** and are **off by default**. Each half has its own enable toggle, provider, and options, stored locally in your browser (`localStorage`, key `lucy:voice`).

## Quick start (no keys)

The **Browser** provider works out of the box on Chromium browsers:

1. Open **Settings → Voice**.
2. Under **Speech to Text**, flip **Enable** on — the mic button appears in the chat bar.
3. Under **Text to Speech**, flip **Enable** on — a speaker button appears on each of Lucy's replies.

Browser STT uses the Web Speech API and shows words live as you speak. Browser TTS uses your operating system's installed voices. Neither sends audio off your machine.

## Speech to text

The mic button sits in the chat input bar. Its behaviour depends on the provider:

- **Browser** — live dictation. Click the mic, speak, and interim text appears greyed-in as it's recognised, committing to final words as you go. Click again to stop.
- **Cloud / local** — press-to-record. Click to start recording (the button turns red), click again to stop; the clip is uploaded, transcribed, and the text is appended to the input box. There is no live preview — you'll see a brief "Transcribing…" state instead.

### STT providers

| Provider | Mode | Engine | Needs |
|---|---|---|---|
| Browser (Web Speech) | Live interim | Chrome → Google, Edge → Microsoft online service | A Chromium browser; OS online speech enabled |
| OpenAI Whisper | Press-to-record | `whisper-1` (default) | Your OpenAI key from [Settings → Providers](/docs/chat) |
| Deepgram Nova-2 | Press-to-record | `nova-2`, `smart_format=true` | A Deepgram key, entered in Settings → Voice |
| Whisper (Local) | Press-to-record | Any OpenAI-compatible `/audio/transcriptions` server | A Base URL (no key) |

### STT options

- **Default Language** — a BCP-47 tag (e.g. `en-US`), passed to the recogniser and to cloud transcription. Defaults to `en-US`.
- **Base URL** / **Model** — shown for OpenAI and Local. Override the endpoint (e.g. `http://localhost:5004/v1`) and model name (e.g. `whisper-1`, or `Systran/faster-whisper-base.en` for a local server).
- **Test microphone** — records or listens right in Settings so you can confirm the provider works before using it in chat.

### How cloud capture works

Non-browser providers record audio with `MediaRecorder` (WebM/Opus where supported), then POST the clip to `/api/voice/transcribe`:

```
mic → MediaRecorder → Blob → POST /api/voice/transcribe
  body:    file, provider, model?, language?, baseUrl?
  headers: x-openai-key (openai/local) or x-deepgram-key (deepgram)
  ← { text }
```

The route requires a signed-in session, dispatches to OpenAI/Deepgram with your key, and returns plain text. Recording needs a **secure context** (localhost or HTTPS) and `getUserMedia` — the mic button disables itself with a hint when that's missing.

> Browser STT can intermittently drop with a transient `network` error because it relies on an online service. Lucy silently auto-restarts a couple of times before surfacing the error. If it persists, enable your OS online speech recognition, try Chrome (more reliable than Edge), or switch to a cloud/local provider.

## Text to speech

When TTS is enabled, every assistant message gets a **speaker** button (visible on hover):

- Click it to read that reply aloud; click again (or click another message) to stop. Starting new speech always cancels whatever was playing.
- Turn on **Auto-read** to have Lucy speak each reply automatically as soon as it finishes streaming.

### TTS providers

| Provider | Engine | Needs |
|---|---|---|
| Browser (speechSynthesis) | OS / browser voices | Nothing |
| OpenAI TTS | `tts-1` (default) | Your OpenAI key from [Settings → Providers](/docs/chat) |
| Local (OpenAI-compatible) | Any OpenAI-compatible `/audio/speech` server | A Base URL (no key) |

### TTS options

- **Voice** — for Browser, the dropdown lists your installed system voices (populated asynchronously). For OpenAI/Local it lists the OpenAI voice names: `alloy` (default), `ash`, `ballad`, `coral`, `echo`, `fable`, `nova`, `onyx`, `sage`, `shimmer`, `verse`.
- **Speed** — playback multiplier from `0.5×` to `2×`. Default `1×`.
- **Base URL** / **Model** — shown for OpenAI and Local. Override the endpoint and model (e.g. `tts-1`).
- **Test voice** — speaks a sample line with your current settings.

### How cloud read-aloud works

Browser TTS speaks directly via `speechSynthesis`. Cloud/local providers POST to `/api/voice/speak` and play back the returned audio:

```
text → POST /api/voice/speak
  body:    text, provider, voice?, speed?, model?, baseUrl?
  headers: x-openai-key (openai/local)
  ← audio/mpeg  → <audio> playback
```

## Where keys come from

| Provider | Key source | How it travels |
|---|---|---|
| OpenAI (STT + TTS) | Your OpenAI key in **Settings → Providers** | `x-openai-key` request header |
| Deepgram (STT) | Entered in **Settings → Voice**, stored in `localStorage` | `x-deepgram-key` request header |
| Local (STT + TTS) | None — point a Base URL at your own server | — |

Keys are **only** sent as per-request headers to Lucy's own `/api/voice/*` routes, never in the request body, and are never logged. The route can also fall back to a server-side `OPENAI_API_KEY` env var if one is configured. The **Browser** and **Local** providers add no third party at all.

## Running a local Whisper server

The repo ships a compose file that runs [Speaches](https://github.com/speaches-ai/speaches) (an OpenAI-compatible transcription server) for offline, key-free STT:

```
docker compose -f docker-compose.whisper.yml up -d
```

Then in **Settings → Voice → Speech to Text**:

- **Provider** — Whisper (Local)
- **Base URL** — `http://localhost:5004/v1`
- **Model** — `Systran/faster-whisper-base.en`

Models download on first use and are cached. The same Base URL/Model pattern works for the **Local** TTS provider against any OpenAI-compatible `/audio/speech` server.

## Notes

- Voice routes require a signed-in session. In the **desktop / standalone** app everything runs locally; the Browser and Local providers keep audio entirely on your machine or network. Cloud providers send audio only to the vendor you chose, using your own key.
- Capability fallbacks: if the Web Speech API or `MediaRecorder` isn't available, the mic button is disabled with an explanation rather than failing silently.
- See also [Chat & models](/docs/chat) for the message toolbar (the read-aloud button lives there) and where to set your provider keys.
