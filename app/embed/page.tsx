'use client';

/**
 * Embed chat panel — rendered inside the iframe injected by /api/embed.
 *
 * Fully self-contained (inline styles, no app CSS dependency) so it renders
 * reliably on any host site. Reads ?w=<widgetId>, fetches public appearance
 * from /api/embed/config, and streams replies from /api/embed-chat (which uses
 * the widget owner's API key + persona/FAQ server-side). Visitors never enter a key.
 */

import React, { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';

type Msg = { role: 'user' | 'assistant'; content: string };

interface Appearance {
  name: string;
  greeting: string;
  theme: 'dark' | 'light';
  accent: string;
  suggestedQuestions: string[];
}

function useTheme(theme: 'dark' | 'light') {
  const dark = theme !== 'light';
  return {
    dark,
    bg: dark ? '#0f1117' : '#ffffff',
    panel: dark ? '#171a21' : '#f7f7f8',
    text: dark ? '#e8eaed' : '#1a1a1a',
    sub: dark ? '#9aa0aa' : '#6b7280',
    border: dark ? '#262a33' : '#e5e7eb',
    botBubble: dark ? '#1f232c' : '#eef0f3',
  };
}

function EmbedPanel() {
  const params = useSearchParams();
  const widgetId = params.get('w') ?? '';

  const [app, setApp] = useState<Appearance>({
    name: 'Assistant', greeting: 'Hi! How can I help?', theme: 'dark', accent: '#7c3aed', suggestedQuestions: [],
  });
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const convId = useRef<string>('');
  const c = useTheme(app.theme);

  // Stable per-visit conversation id (so the owner sees one thread, not many).
  useEffect(() => {
    if (!widgetId) return;
    const k = `lucy_conv_${widgetId}`;
    let id = '';
    try { id = sessionStorage.getItem(k) || ''; } catch { /* private mode */ }
    if (!id) {
      const a = new Uint8Array(16);
      (globalThis.crypto || ({} as any)).getRandomValues?.(a);
      id = Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('') || String(widgetId).slice(0, 8) + 'x';
      try { sessionStorage.setItem(k, id); } catch { /* ignore */ }
    }
    convId.current = id;
  }, [widgetId]);

  useEffect(() => {
    if (!widgetId) return;
    fetch(`/api/embed/config?w=${encodeURIComponent(widgetId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok && d.widget) {
          setApp({
            name: d.widget.name || 'Assistant',
            greeting: d.widget.greeting || 'Hi! How can I help?',
            theme: d.widget.theme === 'light' ? 'light' : 'dark',
            accent: /^#[0-9a-fA-F]{6}$/.test(d.widget.accent) ? d.widget.accent : '#7c3aed',
            suggestedQuestions: Array.isArray(d.widget.suggested_questions) ? d.widget.suggested_questions : [],
          });
        }
      })
      .catch(() => {});
  }, [widgetId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  async function send(preset?: string) {
    const text = (preset ?? input).trim();
    if (!text || busy) return;
    const next: Msg[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setBusy(true);
    // Placeholder assistant message we fill as the stream arrives.
    setMessages((m) => [...m, { role: 'assistant', content: '' }]);

    try {
      const res = await fetch('/api/embed-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ widgetId, conversationId: convId.current, messages: next }),
      });
      if (!res.body) throw new Error('no stream');
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let done = false;
      while (!done) {
        const { value, done: rdDone } = await reader.read();
        if (rdDone) break;
        buf += dec.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const raw = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 2);
          if (!raw.startsWith('data:')) continue;
          const payload = raw.slice(5).trim();
          if (payload === '[DONE]') { done = true; break; }
          try {
            const obj = JSON.parse(payload);
            if (obj.delta) {
              setMessages((m) => {
                const copy = m.slice();
                copy[copy.length - 1] = {
                  role: 'assistant',
                  content: copy[copy.length - 1].content + obj.delta,
                };
                return copy;
              });
            } else if (obj.error) {
              setMessages((m) => {
                const copy = m.slice();
                copy[copy.length - 1] = { role: 'assistant', content: obj.error };
                return copy;
              });
            }
          } catch { /* ignore partial */ }
        }
      }
    } catch {
      setMessages((m) => {
        const copy = m.slice();
        copy[copy.length - 1] = { role: 'assistant', content: 'Sorry — I could not reach the assistant.' };
        return copy;
      });
    } finally {
      setBusy(false);
    }
  }

  const shown = messages.length === 0
    ? [{ role: 'assistant' as const, content: app.greeting }]
    : messages;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw',
      background: c.bg, color: c.text, fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
      fontSize: 14, overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
        background: app.accent, color: '#fff', flexShrink: 0,
      }}>
        <svg viewBox="0 0 100 100" width="30" height="30" role="img" aria-label="Lucy" style={{ flexShrink: 0 }}>
          <defs>
            <linearGradient id="lucy-embed-mark" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#a855f7" />
              <stop offset="1" stopColor="#6d28d9" />
            </linearGradient>
          </defs>
          <rect width="100" height="100" rx="27" fill="url(#lucy-embed-mark)" />
          <path d="M40 27 V57 C40 69 51 71 62 64" fill="none" stroke="#fff" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="64" cy="39" r="5" fill="#fff" />
        </svg>
        <div style={{ fontWeight: 600, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {app.name}
        </div>
        <button
          onClick={() => window.parent.postMessage('lucy:close', '*')}
          aria-label="Close"
          style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', padding: 4, opacity: 0.9 }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {shown.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '82%', padding: '8px 12px', borderRadius: 14, lineHeight: 1.45,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              background: m.role === 'user' ? app.accent : c.botBubble,
              color: m.role === 'user' ? '#fff' : c.text,
              borderBottomRightRadius: m.role === 'user' ? 4 : 14,
              borderBottomLeftRadius: m.role === 'user' ? 14 : 4,
            }}>
              {m.content || (busy && i === shown.length - 1 ? '…' : '')}
            </div>
          </div>
        ))}

        {/* Starter questions — shown until the visitor sends their first message. */}
        {messages.length === 0 && app.suggestedQuestions.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
            {app.suggestedQuestions.map((q, i) => (
              <button
                key={i}
                onClick={() => send(q)}
                disabled={busy}
                style={{
                  textAlign: 'left', padding: '8px 12px', borderRadius: 14, fontSize: 13, lineHeight: 1.35,
                  background: 'transparent', color: app.accent, cursor: busy ? 'default' : 'pointer',
                  border: `1px solid ${app.accent}`, maxWidth: '100%',
                }}
              >
                {q}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Input */}
      <div style={{ display: 'flex', gap: 8, padding: 10, borderTop: `1px solid ${c.border}`, flexShrink: 0, background: c.panel }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Type a message…"
          disabled={busy}
          style={{
            flex: 1, padding: '10px 12px', borderRadius: 10, border: `1px solid ${c.border}`,
            background: c.bg, color: c.text, outline: 'none', fontSize: 14,
          }}
        />
        <button
          onClick={() => send()}
          disabled={busy || !input.trim()}
          aria-label="Send"
          style={{
            width: 42, borderRadius: 10, border: 'none', cursor: busy ? 'default' : 'pointer',
            background: app.accent, color: '#fff', opacity: busy || !input.trim() ? 0.5 : 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
        </button>
      </div>

      <div style={{ textAlign: 'center', fontSize: 10, color: c.sub, padding: '4px 0 6px', background: c.panel }}>
        Powered by Lucy
      </div>
    </div>
  );
}

export default function EmbedPage() {
  return (
    <Suspense fallback={<div style={{ height: '100vh', background: '#0f1117' }} />}>
      <EmbedPanel />
    </Suspense>
  );
}
