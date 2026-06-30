/**
 * POST /api/voice/speak
 *
 * Accepts JSON body:
 *   { text, provider, voice?, speed?, model?, baseUrl? }
 *
 * Keys are read from request headers:
 *   - `x-openai-key` – for provider=openai or provider=local
 *
 * Returns raw audio/mpeg bytes (streaming from OpenAI SDK).
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveMemoryAuth } from '@/lib/memory/auth';
import OpenAI from 'openai';

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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  let body: {
    text?: string;
    provider?: string;
    voice?: string;
    speed?: number;
    model?: string;
    baseUrl?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { text, provider = 'openai', voice, speed, model, baseUrl } = body;

  if (!text || !text.trim()) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 });
  }

  try {
    // ── OpenAI / Local (OpenAI-compatible) ────────────────────────────────────
    if (provider === 'openai' || provider === 'local') {
      const apiKey =
        req.headers.get('x-openai-key') ||
        process.env.OPENAI_API_KEY ||
        'not-required';

      const client = new OpenAI({
        apiKey,
        ...(baseUrl ? { baseURL: baseUrl } : {}),
      });

      const speechResponse = await client.audio.speech.create({
        model: model || 'tts-1',
        voice: (voice as OpenAI.Audio.Speech.SpeechCreateParams['voice']) || 'alloy',
        input: text,
        ...(speed ? { speed } : {}),
      });

      // Buffer the audio and return it as audio/mpeg.
      const audioBuffer = Buffer.from(await speechResponse.arrayBuffer());

      return new Response(audioBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'audio/mpeg',
          'Content-Length': String(audioBuffer.length),
          'Cache-Control': 'no-store',
        },
      });
    }

    return NextResponse.json(
      { error: `Unknown provider: ${provider}` },
      { status: 400 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Speech synthesis failed';
    // Never expose the key; just log.
    console.error('[voice/speak] error:', message);
    return NextResponse.json({ error: 'Speech synthesis failed' }, { status: 500 });
  }
}
