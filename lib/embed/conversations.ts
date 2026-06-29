// lib/embed/conversations.ts — persistence + owner-side reading of embed widget
// conversations (lucy.embed_conversations / lucy.embed_messages). The widget chat
// is anonymous; we log each visitor turn so the owner can read them later.
import { createClient } from '@supabase/supabase-js';

function svc() {
  return createClient(
    (process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { db: { schema: 'lucy' }, auth: { persistSession: false } },
  );
}

const MAX_MSG = 8000;

export interface ConvSummary {
  id: string;
  widget_id: string;
  message_count: number;
  created_at: string;
  last_at: string;
  preview: string;
}

export interface ConvMessage {
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

/** Create the conversation row on first turn (no-op if it already exists). */
export async function ensureConversation(id: string, widgetId: string, ownerId: string): Promise<void> {
  await svc()
    .from('embed_conversations')
    .upsert({ id, widget_id: widgetId, user_id: ownerId }, { onConflict: 'id', ignoreDuplicates: true });
}

export async function addMessage(conversationId: string, role: 'user' | 'assistant', content: string): Promise<void> {
  await svc()
    .from('embed_messages')
    .insert({ conversation_id: conversationId, role, content: content.slice(0, MAX_MSG) });
}

/** Recompute message_count + last_at after a turn. */
export async function finalizeConversation(id: string): Promise<void> {
  const { count } = await svc()
    .from('embed_messages')
    .select('*', { count: 'exact', head: true })
    .eq('conversation_id', id);
  await svc()
    .from('embed_conversations')
    .update({ message_count: count ?? 0, last_at: new Date().toISOString() })
    .eq('id', id);
}

/** Owner-scoped list of a widget's conversations, newest first, with a preview. */
export async function listConversations(ownerId: string, widgetId: string): Promise<ConvSummary[]> {
  const { data } = await svc()
    .from('embed_conversations')
    .select('id,widget_id,message_count,created_at,last_at')
    .eq('user_id', ownerId)
    .eq('widget_id', widgetId)
    .order('last_at', { ascending: false })
    .limit(100);
  const rows = data ?? [];
  if (!rows.length) return [];

  const ids = rows.map((r: any) => r.id);
  const { data: msgs } = await svc()
    .from('embed_messages')
    .select('conversation_id,content')
    .in('conversation_id', ids)
    .eq('role', 'user')
    .order('created_at', { ascending: true });
  const preview = new Map<string, string>();
  for (const m of msgs ?? []) if (!preview.has(m.conversation_id)) preview.set(m.conversation_id, m.content);

  return rows.map((r: any) => ({ ...r, preview: preview.get(r.id) ?? '' }));
}

/** Full transcript for one conversation, or null if it isn't the owner's. */
export async function getTranscript(
  ownerId: string,
  conversationId: string,
): Promise<{ id: string; widget_id: string; created_at: string; messages: ConvMessage[] } | null> {
  const { data: conv } = await svc()
    .from('embed_conversations')
    .select('id,user_id,widget_id,created_at')
    .eq('id', conversationId)
    .maybeSingle();
  if (!conv || conv.user_id !== ownerId) return null;

  const { data: msgs } = await svc()
    .from('embed_messages')
    .select('role,content,created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });
  return { id: conv.id, widget_id: conv.widget_id, created_at: conv.created_at, messages: (msgs ?? []) as ConvMessage[] };
}
