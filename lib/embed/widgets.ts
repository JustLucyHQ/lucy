// lib/embed/widgets.ts — per-user embed chat-widget configs (lucy.embed_widgets).
import { randomBytes } from 'crypto';
import { createClient } from '@supabase/supabase-js';

function svc() {
  return createClient(
    (process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { db: { schema: 'lucy' }, auth: { persistSession: false } },
  );
}

export interface EmbedWidget {
  id: string;
  user_id: string;
  name: string;
  persona: string;
  faq: string;
  model: string;
  provider: string;
  greeting: string;
  launcher_label: string;
  position: string;
  theme: string;
  accent: string;
  allowed_origins: string[];
  show_questions: boolean;
  suggested_questions: string[];
}

const COLS =
  'id, user_id, name, persona, faq, model, provider, greeting, launcher_label, position, theme, accent, allowed_origins, show_questions, suggested_questions';

const EDITABLE = [
  'name', 'persona', 'faq', 'model', 'provider', 'greeting',
  'launcher_label', 'position', 'theme', 'accent', 'allowed_origins',
  'show_questions', 'suggested_questions',
] as const;

export async function createWidget(userId: string, p: Partial<EmbedWidget>): Promise<EmbedWidget> {
  const id = randomBytes(8).toString('hex');
  const { data, error } = await svc()
    .from('embed_widgets')
    .insert({
      id,
      user_id: userId,
      name: p.name ?? 'My assistant',
      persona: p.persona ?? '',
      faq: p.faq ?? '',
      model: p.model ?? 'gpt-4o',
      provider: p.provider ?? 'openai',
      greeting: p.greeting ?? 'Hi! How can I help?',
      launcher_label: p.launcher_label ?? 'Chat with us',
      position: p.position ?? 'bottom-right',
      theme: p.theme ?? 'dark',
      accent: p.accent ?? '#7c3aed',
      allowed_origins: p.allowed_origins ?? [],
      show_questions: p.show_questions ?? true,
      suggested_questions: p.suggested_questions ?? [],
    })
    .select(COLS)
    .single();
  if (error) throw error;
  return data as EmbedWidget;
}

export async function listWidgets(userId: string): Promise<EmbedWidget[]> {
  const { data } = await svc()
    .from('embed_widgets')
    .select(COLS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  return (data ?? []) as EmbedWidget[];
}

/** Public read by id (used by the widget + embed-chat). */
export async function getWidget(id: string): Promise<EmbedWidget | null> {
  const { data } = await svc().from('embed_widgets').select(COLS).eq('id', id).maybeSingle();
  return (data as EmbedWidget) ?? null;
}

export async function updateWidget(userId: string, id: string, patch: Partial<EmbedWidget>): Promise<void> {
  const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of EDITABLE) if (k in patch) upd[k] = (patch as any)[k];
  await svc().from('embed_widgets').update(upd).eq('user_id', userId).eq('id', id);
}

export async function deleteWidget(userId: string, id: string): Promise<void> {
  await svc().from('embed_widgets').delete().eq('user_id', userId).eq('id', id);
}
