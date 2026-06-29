// /api/embed/widgets — owner CRUD for embed chat widgets (auth required).
import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resolveMemoryAuth } from '@/lib/memory/auth';
import {
  createWidget, listWidgets, updateWidget, deleteWidget, type EmbedWidget,
} from '@/lib/embed/widgets';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Default a new widget's model to a provider the owner actually has a key for. */
async function defaultModel(userId: string): Promise<{ model: string; provider: string }> {
  const url = process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    const s = createClient(url, key, { db: { schema: 'lucy' } });
    const { data } = await s.from('provider_configs').select('provider').eq('user_id', userId).eq('is_active', true);
    const provs = new Set((data ?? []).map((r: { provider: string }) => r.provider));
    if (provs.has('openai')) return { model: 'gpt-4o', provider: 'openai' };
    if (provs.has('anthropic')) return { model: 'claude-sonnet-4-6', provider: 'anthropic' };
  }
  return { model: 'gpt-4o', provider: 'openai' };
}

const MODELS = ['gpt-4o', 'gpt-4o-mini', 'claude-haiku-4-5', 'claude-sonnet-4-6', 'claude-opus-4-8'];
const POSITIONS = ['bottom-right', 'bottom-left'];
const THEMES = ['dark', 'light'];

function clean(body: any): Partial<EmbedWidget> {
  const out: Partial<EmbedWidget> = {};
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : undefined);
  if ('name' in body) out.name = str(body.name, 80);
  if ('persona' in body) out.persona = str(body.persona, 8000);
  if ('faq' in body) out.faq = str(body.faq, 20000);
  if ('greeting' in body) out.greeting = str(body.greeting, 400);
  if ('launcher_label' in body) out.launcher_label = str(body.launcher_label, 40);
  if ('model' in body && MODELS.includes(body.model)) out.model = body.model;
  if (out.model) out.provider = out.model.startsWith('claude') ? 'anthropic' : 'openai';
  if ('position' in body && POSITIONS.includes(body.position)) out.position = body.position;
  if ('theme' in body && THEMES.includes(body.theme)) out.theme = body.theme;
  if ('accent' in body && /^#[0-9a-fA-F]{6}$/.test(body.accent)) out.accent = body.accent;
  if (Array.isArray(body.allowed_origins)) {
    out.allowed_origins = body.allowed_origins.filter((o: unknown) => typeof o === 'string').slice(0, 20);
  }
  if ('show_questions' in body) out.show_questions = Boolean(body.show_questions);
  if (Array.isArray(body.suggested_questions)) {
    out.suggested_questions = body.suggested_questions
      .filter((q: unknown) => typeof q === 'string' && q.trim())
      .map((q: string) => q.trim().slice(0, 200))
      .slice(0, 6);
  }
  return out;
}

export async function GET(req: NextRequest) {
  const { userId } = await resolveMemoryAuth(req);
  if (!userId) return Response.json({ ok: false }, { status: 401 });
  return Response.json({ ok: true, widgets: await listWidgets(userId) });
}

export async function POST(req: NextRequest) {
  const { userId } = await resolveMemoryAuth(req);
  if (!userId) return Response.json({ ok: false }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const cleaned = clean(body);
  if (!cleaned.model) {
    const def = await defaultModel(userId);
    cleaned.model = def.model;
    cleaned.provider = def.provider;
  }
  const widget = await createWidget(userId, cleaned);
  return Response.json({ ok: true, widget });
}

export async function PATCH(req: NextRequest) {
  const { userId } = await resolveMemoryAuth(req);
  if (!userId) return Response.json({ ok: false }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (!body?.id) return Response.json({ ok: false, error: 'id required' }, { status: 400 });
  await updateWidget(userId, String(body.id), clean(body));
  return Response.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { userId } = await resolveMemoryAuth(req);
  if (!userId) return Response.json({ ok: false }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return Response.json({ ok: false, error: 'id required' }, { status: 400 });
  await deleteWidget(userId, id);
  return Response.json({ ok: true });
}
