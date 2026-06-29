'use client';

/**
 * Chat Widgets (top-level, like Connectors)
 *
 * Build embeddable chat widgets: each has its own persona, FAQ/knowledge,
 * model, and look. The owner's provider key is used server-side (/api/embed-chat),
 * so visitors never enter a key. Copy the one-line <script> snippet to any site.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Trash2, Copy, Check, Loader2, MessageSquare, Inbox, ArrowLeft, ExternalLink } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';

interface Widget {
  id: string;
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

interface ConvSummary {
  id: string;
  message_count: number;
  created_at: string;
  last_at: string;
  preview: string;
}
interface Transcript {
  id: string;
  created_at: string;
  messages: { role: 'user' | 'assistant'; content: string; created_at: string }[];
}

type Tab = 'configure' | 'conversations';

const MODELS = [
  { id: 'gpt-4o', label: 'GPT-4o (OpenAI)' },
  { id: 'gpt-4o-mini', label: 'GPT-4o mini (OpenAI)' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (Anthropic) — fast & cheap' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (Anthropic) — balanced' },
  { id: 'claude-opus-4-8', label: 'Claude Opus 4.8 (Anthropic) — most capable' },
];

const origin = () => (typeof window !== 'undefined' ? window.location.origin : 'https://justlucy.ai');

export default function WidgetsPage() {
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [loading, setLoading] = useState(true);
  const [selId, setSelId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Widget | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedTick, setSavedTick] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/embed/widgets', { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    const list: Widget[] = data.widgets ?? [];
    setWidgets(list);
    setLoading(false);
    return list;
  }, []);

  useEffect(() => { load(); }, [load]);

  // Keep the draft in sync when a different widget is selected.
  useEffect(() => {
    const w = widgets.find((x) => x.id === selId) ?? null;
    setDraft(w ? { ...w } : null);
    setSavedTick(false);
  }, [selId, widgets]);

  const create = async () => {
    const res = await fetch('/api/embed/widgets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New assistant' }),
    });
    const data = await res.json().catch(() => ({}));
    if (data.ok) {
      await load();
      setSelId(data.widget.id);
    }
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    await fetch('/api/embed/widgets', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    });
    await load();
    setSaving(false);
    setSavedTick(true);
    setTimeout(() => setSavedTick(false), 1800);
  };

  const remove = async (id: string) => {
    await fetch(`/api/embed/widgets?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (selId === id) setSelId(null);
    await load();
  };

  const snippet = draft
    ? `<script src="${origin()}/api/embed?w=${draft.id}" async></script>`
    : '';

  const copySnippet = () => {
    navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const set = (patch: Partial<Widget>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  // ── Conversations ────────────────────────────────────────────────────────
  const [tab, setTab] = useState<Tab>('configure');
  const [convs, setConvs] = useState<ConvSummary[]>([]);
  const [convLoading, setConvLoading] = useState(false);
  const [openConv, setOpenConv] = useState<Transcript | null>(null);

  // Reset to the Configure tab whenever a different widget is selected.
  useEffect(() => { setTab('configure'); setOpenConv(null); }, [selId]);

  const loadConvs = useCallback(async (widgetId: string) => {
    setConvLoading(true);
    const res = await fetch(`/api/embed/conversations?widgetId=${encodeURIComponent(widgetId)}`, { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    setConvs(data.conversations ?? []);
    setConvLoading(false);
  }, []);

  useEffect(() => {
    if (tab === 'conversations' && selId) loadConvs(selId);
  }, [tab, selId, loadConvs]);

  const openTranscript = async (id: string) => {
    const res = await fetch(`/api/embed/conversations?id=${encodeURIComponent(id)}`, { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (data.ok) setOpenConv(data.transcript);
  };

  return (
    <AppShell title="Chat Widgets">
      <div className="max-w-4xl mx-auto space-y-6 pb-12">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-t1">Chat Widgets</h1>
            <p className="text-sm text-t3 mt-1">
              Embeddable chat assistants for your website. Each uses <strong>your</strong> API key
              server-side, so your visitors never need one.
            </p>
          </div>
          <button
            onClick={create}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-theme bg-lucy-600 hover:bg-lucy-500 text-white text-sm font-medium shrink-0"
          >
            <Plus className="w-4 h-4" /> New widget
          </button>
        </header>

        {loading ? (
          <div className="h-24 rounded-theme bg-raised border border-edge animate-pulse" />
        ) : widgets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-edge-strong rounded-theme">
            <MessageSquare className="w-8 h-8 text-t3 mb-3" />
            <p className="text-sm text-t2">No widgets yet.</p>
            <button onClick={create} className="text-sm text-lucy-400 hover:text-lucy-300 mt-2">
              Create your first widget
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {widgets.map((w) => (
              <button
                key={w.id}
                onClick={() => setSelId(w.id === selId ? null : w.id)}
                className={`px-3 py-1.5 rounded-theme text-sm border transition-colors ${
                  selId === w.id
                    ? 'border-lucy-500 bg-lucy-700/30 text-t1'
                    : 'border-edge-strong bg-raised text-t2 hover:text-t1'
                }`}
              >
                {w.name || 'Untitled'}
              </button>
            ))}
          </div>
        )}

        {draft && (
          <div className="space-y-4">
            {/* Configure / Conversations tabs */}
            <div className="flex gap-1 p-1 bg-raised border border-edge rounded-theme w-fit">
              {(['configure', 'conversations'] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                    tab === t ? 'bg-lucy-700/30 text-t1' : 'text-t3 hover:text-t2'
                  }`}
                >
                  {t === 'conversations' ? 'Conversations' : 'Configure'}
                </button>
              ))}
            </div>

            {tab === 'configure' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Editor */}
            <div className="space-y-4">
              <Field label="Name">
                <input className={inputCls} value={draft.name}
                  onChange={(e) => set({ name: e.target.value })} placeholder="Support assistant" />
              </Field>

              <Field label="Persona / instructions" hint="How the assistant should behave and sound.">
                <textarea className={`${inputCls} h-24 resize-y`} value={draft.persona}
                  onChange={(e) => set({ persona: e.target.value })}
                  placeholder="You are the friendly support assistant for Acme Co. Be concise and warm…" />
              </Field>

              <Field label="Knowledge / FAQ" hint="Facts the assistant can answer from. Plain text or Q&A pairs.">
                <textarea className={`${inputCls} h-32 resize-y`} value={draft.faq}
                  onChange={(e) => set({ faq: e.target.value })}
                  placeholder={'Q: What are your hours?\nA: We are open 9–5 ET, Mon–Fri.\n\nShipping takes 3–5 business days.'} />
              </Field>

              {/* Suggested questions + show/hide toggle */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-t2">Suggested questions</label>
                  <label className="flex items-center gap-2 text-xs text-t3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={draft.show_questions}
                      onChange={(e) => set({ show_questions: e.target.checked })}
                      className="accent-lucy-600 w-3.5 h-3.5"
                    />
                    Show questions
                  </label>
                </div>
                <textarea
                  className={`${inputCls} h-24 resize-y ${draft.show_questions ? '' : 'opacity-50'}`}
                  value={(draft.suggested_questions ?? []).join('\n')}
                  onChange={(e) =>
                    set({ suggested_questions: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 6) })
                  }
                  placeholder={'How long does an order take?\nHow do I become a publisher?\nDo you guarantee rankings?'}
                  disabled={!draft.show_questions}
                />
                <p className="text-[11px] text-t3">
                  Up to 6 starter questions visitors can tap. They can still type their own. Toggle off to hide them.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Model">
                  <select className={inputCls} value={draft.model}
                    onChange={(e) => set({ model: e.target.value })}>
                    {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                </Field>
                <Field label="Accent color">
                  <div className="flex items-center gap-2">
                    <input type="color" value={draft.accent}
                      onChange={(e) => set({ accent: e.target.value })}
                      className="w-10 h-9 rounded border border-edge-strong bg-transparent cursor-pointer" />
                    <input className={inputCls} value={draft.accent}
                      onChange={(e) => set({ accent: e.target.value })} />
                  </div>
                </Field>
              </div>

              <Field label="Greeting" hint="First message the visitor sees.">
                <input className={inputCls} value={draft.greeting}
                  onChange={(e) => set({ greeting: e.target.value })} placeholder="Hi! How can I help?" />
              </Field>

              <div className="grid grid-cols-3 gap-3">
                <Field label="Launcher label">
                  <input className={inputCls} value={draft.launcher_label}
                    onChange={(e) => set({ launcher_label: e.target.value })} placeholder="Chat with us" />
                </Field>
                <Field label="Position">
                  <select className={inputCls} value={draft.position}
                    onChange={(e) => set({ position: e.target.value })}>
                    <option value="bottom-right">Bottom right</option>
                    <option value="bottom-left">Bottom left</option>
                  </select>
                </Field>
                <Field label="Theme">
                  <select className={inputCls} value={draft.theme}
                    onChange={(e) => set({ theme: e.target.value })}>
                    <option value="dark">Dark</option>
                    <option value="light">Light</option>
                  </select>
                </Field>
              </div>

              <Field
                label="Allowed domains"
                hint="One per line. Leave empty to allow it anywhere. When set, only these sites can use the widget — protects your API key from being embedded elsewhere."
              >
                <textarea
                  className={`${inputCls} h-20 resize-y font-mono text-xs`}
                  value={(draft.allowed_origins ?? []).join('\n')}
                  onChange={(e) =>
                    set({ allowed_origins: e.target.value.split(/[\n,]/).map((s) => s.trim()).filter(Boolean) })
                  }
                  placeholder={'example.com\nwww.example.com'}
                />
              </Field>

              <div className="flex items-center gap-3 pt-1">
                <button onClick={save} disabled={saving}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-theme bg-lucy-600 hover:bg-lucy-500 text-white text-sm font-medium disabled:opacity-50">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : savedTick ? <Check className="w-4 h-4" /> : null}
                  {savedTick ? 'Saved' : 'Save changes'}
                </button>
                <button onClick={() => remove(draft.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-theme text-sm text-red-400 hover:bg-red-900/20">
                  <Trash2 className="w-4 h-4" /> Delete
                </button>
              </div>

              {/* Snippet */}
              <div className="pt-2">
                <label className="text-xs font-medium text-t3">Embed snippet</label>
                <div className="mt-1 relative">
                  <pre className="bg-base border border-edge-strong rounded-theme p-3 pr-12 text-xs text-green-400 overflow-x-auto">
                    {snippet}
                  </pre>
                  <button onClick={copySnippet}
                    className="absolute top-2 right-2 p-1.5 rounded hover:bg-raised text-t3 hover:text-t1">
                    {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-t3 mt-1">
                  Save first, then paste this before <code>&lt;/body&gt;</code> on any page. Changes apply automatically.
                </p>
                <a
                  href={`/embed?w=${draft.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 mt-2 text-xs text-lucy-400 hover:text-lucy-300"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Open test page in a new tab
                </a>
              </div>
            </div>

            {/* Live preview */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-t3">Live preview</label>
              <div className="rounded-theme border border-edge-strong overflow-hidden bg-base" style={{ height: 560 }}>
                <iframe
                  key={`${draft.id}-${draft.theme}-${draft.accent}`}
                  src={`/embed?w=${draft.id}`}
                  title="Widget preview"
                  className="w-full h-full"
                />
              </div>
              <p className="text-[11px] text-t3">Preview reflects the last saved version.</p>
            </div>
          </div>
            )}

            {tab === 'conversations' && (
              openConv ? (
                <div className="space-y-3">
                  <button
                    onClick={() => setOpenConv(null)}
                    className="inline-flex items-center gap-1 text-sm text-t3 hover:text-t1"
                  >
                    <ArrowLeft className="w-4 h-4" /> Back to conversations
                  </button>
                  <div className="rounded-theme border border-edge-strong bg-base p-4 space-y-3 max-h-[60vh] overflow-y-auto">
                    {openConv.messages.length === 0 ? (
                      <p className="text-sm text-t3">No messages in this conversation.</p>
                    ) : (
                      openConv.messages.map((m, i) => (
                        <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                          <div
                            className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap ${
                              m.role === 'user' ? 'bg-lucy-600 text-white' : 'bg-raised text-t1'
                            }`}
                          >
                            {m.content}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  <p className="text-[11px] text-t3">Started {new Date(openConv.created_at).toLocaleString()}</p>
                </div>
              ) : convLoading ? (
                <div className="h-20 rounded-theme bg-raised border border-edge animate-pulse" />
              ) : convs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 text-center border border-dashed border-edge-strong rounded-theme">
                  <Inbox className="w-8 h-8 text-t3 mb-3" />
                  <p className="text-sm text-t2">No conversations yet.</p>
                  <p className="text-xs text-t3 mt-1">When visitors chat with this widget, their conversations appear here.</p>
                </div>
              ) : (
                <div className="divide-y divide-edge border border-edge-strong rounded-theme overflow-hidden">
                  {convs.map((cv) => (
                    <button
                      key={cv.id}
                      onClick={() => openTranscript(cv.id)}
                      className="w-full text-left px-4 py-3 hover:bg-raised/60 transition-colors flex items-center gap-3"
                    >
                      <MessageSquare className="w-4 h-4 text-t3 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-t1 truncate">{cv.preview || '(no message)'}</p>
                        <p className="text-[11px] text-t3">
                          {cv.message_count} messages · {new Date(cv.last_at).toLocaleString()}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}

const inputCls =
  'w-full bg-raised border border-edge-strong rounded-theme px-3 py-2 text-sm text-t1 placeholder-t3 outline-none focus:border-lucy-500';

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-t2">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-t3">{hint}</p>}
    </div>
  );
}
