/**
 * POST /api/voice/transcribe
 *
 * Accepts multipart/form-data with:
 *   - `file`      – audio Blob (e.g. audio/webm from MediaRecorder)
 *   - `provider`  – 'openai' | 'deepgram' | 'local'
 *   - `model`     – optional model override (e.g. 'whisper-1')
 *   - `language`  – optional BCP-47 tag (e.g. 'en')
 *   - `baseUrl`   – optional API base URL (for 'local' / 'openai' override)
 *
 * Keys are read from request headers (never from the body):
 *   - `x-openai-key`   – for provider=openai or provider=local
 *   - `x-deepgram-key` – for provider=deepgram
 *
 * Returns: { text: string } or { text: '', error: string } on failure.
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveMemoryAuth } from '@/lib/memory/auth';
import { assertPublicHttpUrl } from '@/lib/security/ssrf-guard';
import OpenAI, { toFile } from 'openai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // Auth — require a valid session or API key in connected mode. Standalone
  // (no Supabase) is single-user local: the user's own key rides in the headers,
  // so there's no backend identity to check and gating would only break voice.
  const supabaseEnabled = Boolean(
    (process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  if (supabaseEnabled) {
    const { userId } = await resolveMemoryAuth(req);
    if (!userId) {
      return NextResponse.json({ text: '', error: 'Unauthorized' }, { status: 401 });
    }
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ text: '', error: 'Invalid multipart form data' }, { status: 400 });
  }

  const file = formData.get('file') as File | Blob | null;
  const provider = (formData.get('provider') as string) || 'openai';
  const model = (formData.get('model') as string) || undefined;
  const language = (formData.get('language') as string) || undefined;
  const baseUrl = (formData.get('baseUrl') as string) || undefined;

  if (!file) {
    return NextResponse.json({ text: '', error: 'Missing audio file' }, { status: 400 });
  }

  try {
    // ── OpenAI / Local (OpenAI-compatible) ────────────────────────────────────
    if (provider === 'openai' || provider === 'local') {
      // A custom baseUrl is legitimate for self-hosted Whisper-compatible servers
      // (e.g. a local sidecar on the user's own machine/network). On the hosted
      // multi-tenant SaaS, block private/internal targets to prevent SSRF; a
      // single-tenant self-host has a genuine reason to reach its own localhost.
      if (baseUrl && process.env.WORKFLOW_MULTI_TENANT === '1') {
        try {
          assertPublicHttpUrl(baseUrl, 'voice transcribe baseUrl');
        } catch (e) {
          const message = e instanceof Error ? e.message : 'Invalid baseUrl';
          return NextResponse.json({ text: '', error: message }, { status: 400 });
        }
      }

      // Never relay the server's own OPENAI_API_KEY to a caller-supplied baseUrl —
      // that key is only valid (and only meant) for the real OpenAI endpoint.
      const apiKey =
        req.headers.get('x-openai-key') ||
        (baseUrl ? undefined : process.env.OPENAI_API_KEY) ||
        'not-required';

      const client = new OpenAI({
        apiKey,
        ...(baseUrl ? { baseURL: baseUrl } : {}),
      });

      // The OpenAI SDK accepts a Web File/Blob directly via toFile().
      // We normalise it to ensure the filename hint (audio.webm) is present.
      const audioFile = await toFile(file, 'audio.webm', {
        type: (file as File).type || 'audio/webm',
      });

      const transcription = await client.audio.transcriptions.create({
        file: audioFile,
        model: model || 'whisper-1',
        ...(language ? { language } : {}),
      });

      return NextResponse.json({ text: transcription.text });
    }

    // ── Deepgram ──────────────────────────────────────────────────────────────
    if (provider === 'deepgram') {
      const deepgramKey = req.headers.get('x-deepgram-key') || '';
      if (!deepgramKey) {
        return NextResponse.json(
          { text: '', error: 'No Deepgram API key provided' },
          { status: 400 }
        );
      }

      const lang = language || 'en';
      const audioBuffer = await (file as Blob).arrayBuffer();
      const contentType = (file as File).type || 'audio/webm';

      const dgRes = await fetch(
        `https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&language=${lang}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Token ${deepgramKey}`,
            'Content-Type': contentType,
          },
          body: audioBuffer,
        }
      );

      if (!dgRes.ok) {
        const errText = await dgRes.text().catch(() => String(dgRes.status));
        // Never include the key in the error message.
        return NextResponse.json(
          { text: '', error: `Deepgram error: ${dgRes.status}` },
          { status: 500 }
        );
      }

      const dgJson = await dgRes.json();
      const transcript: string =
        dgJson?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '';

      return NextResponse.json({ text: transcript });
    }

    return NextResponse.json(
      { text: '', error: `Unknown provider: ${provider}` },
      { status: 400 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Transcription failed';
    // Scrub any potential key leakage from error messages.
    console.error('[voice/transcribe] error:', message);
    return NextResponse.json({ text: '', error: 'Transcription failed' }, { status: 500 });
  }
}
