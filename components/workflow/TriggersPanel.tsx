// components/workflow/TriggersPanel.tsx
'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { X, Clock, Webhook, Database, Trash2, Plus, Copy } from 'lucide-react';

const CRON_PRESETS: { label: string; expr: string }[] = [
  { label: 'Every hour', expr: '0 * * * *' },
  { label: 'Every day at 09:00', expr: '0 9 * * *' },
  { label: 'Every Monday at 09:00', expr: '0 9 * * 1' },
  { label: 'Custom…', expr: '' },
];

const WATCHED_TABLES = ['conversations', 'memories'];
const EVENT_OPS: { op: string; label: string }[] = [
  { op: 'INSERT', label: 'Created' },
  { op: 'UPDATE', label: 'Updated' },
  { op: 'DELETE', label: 'Deleted' },
];

interface Trigger {
  id: string; name: string; type: 'cron' | 'webhook' | 'record_event';
  settings: { expr?: string; table?: string; events?: string[] };
  enabled: boolean; secret: string | null; next_run_at: string | null;
}

interface Props {
  workflowId: string;
  definition: { name: string; nodes: unknown[]; edges: unknown[] };
  onClose: () => void;
}

export function TriggersPanel({ workflowId, definition, onClose }: Props) {
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [adding, setAdding] = useState<'cron' | 'record' | null>(null);
  const [cron, setCron] = useState('0 9 * * *');
  const [recTable, setRecTable] = useState('conversations');
  const [recEvents, setRecEvents] = useState<string[]>(['INSERT']);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/workflows/triggers?workflowId=${encodeURIComponent(workflowId)}`);
      if (res.ok) setTriggers((await res.json()).triggers ?? []);
    } catch { /* ignore */ }
  }, [workflowId]);
  useEffect(() => {
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load]);

  const create = async (type: 'cron' | 'webhook' | 'record_event') => {
    setBusy(true); setErr(null);
    try {
      const body: Record<string, unknown> = { workflowId, type, definition, name: definition.name || 'Trigger' };
      if (type === 'cron') body.settings = { expr: cron };
      if (type === 'record_event') {
        if (recEvents.length === 0) { setErr('Pick at least one event'); return; }
        body.settings = { table: recTable, events: recEvents };
      }
      const res = await fetch('/api/workflows/triggers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { setErr(data?.error || 'Failed'); return; }
      setAdding(null); await load();
    } finally { setBusy(false); }
  };

  const toggle = async (t: Trigger) => {
    await fetch(`/api/workflows/triggers/${t.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: !t.enabled }) });
    load();
  };
  const remove = async (t: Trigger) => {
    await fetch(`/api/workflows/triggers/${t.id}`, { method: 'DELETE' });
    load();
  };

  const webhookUrl = (t: Trigger) => {
    const base = process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== 'undefined' ? window.location.origin : '');
    return `${base}/api/workflows/triggers/${t.id}/webhook?token=${t.secret ?? ''}`;
  };

  return (
    <div className="absolute right-0 top-0 h-full w-96 bg-gray-900 border-l border-gray-800 flex flex-col z-20">
      <div className="flex items-center justify-between px-4 h-10 border-b border-gray-800 shrink-0">
        <span className="text-xs font-medium text-gray-300">Triggers</span>
        <button onClick={onClose} className="text-gray-600 hover:text-gray-300"><X className="w-4 h-4" /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {triggers.length === 0 && !adding && (
          <p className="text-xs text-gray-600">No triggers. Add one to run this workflow automatically.</p>
        )}
        {triggers.map((t) => (
          <div key={t.id} className="rounded-lg border border-gray-800 bg-gray-800/40 p-2.5 text-xs space-y-1.5">
            <div className="flex items-center gap-2">
              {t.type === 'cron' ? <Clock className="w-3.5 h-3.5 text-lucy-400" />
                : t.type === 'webhook' ? <Webhook className="w-3.5 h-3.5 text-lucy-400" />
                : <Database className="w-3.5 h-3.5 text-lucy-400" />}
              <span className="text-gray-200 flex-1 truncate">
                {t.type === 'cron' ? `cron: ${t.settings?.expr}`
                  : t.type === 'webhook' ? 'webhook'
                  : `${t.settings?.table} ${(t.settings?.events ?? []).join('/')}`}
              </span>
              <button onClick={() => toggle(t)} className={t.enabled ? 'text-emerald-400' : 'text-gray-500'}>{t.enabled ? 'on' : 'off'}</button>
              <button onClick={() => remove(t)} className="text-gray-500 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
            {t.type === 'webhook' && (
              <button onClick={() => navigator.clipboard.writeText(webhookUrl(t))} className="flex items-center gap-1 text-lucy-400 hover:text-lucy-300">
                <Copy className="w-3 h-3" /> Copy webhook URL
              </button>
            )}
            {t.type === 'cron' && t.next_run_at && <p className="text-gray-600">next: {new Date(t.next_run_at).toLocaleString()}</p>}
          </div>
        ))}

        {adding === 'cron' && (
          <div className="rounded-lg border border-gray-700 bg-gray-800 p-2.5 space-y-2">
            <select value={CRON_PRESETS.some((p) => p.expr === cron) ? cron : ''} onChange={(e) => { if (e.target.value) setCron(e.target.value); }} className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200">
              {CRON_PRESETS.map((p) => <option key={p.label} value={p.expr}>{p.label}</option>)}
            </select>
            <input value={cron} onChange={(e) => setCron(e.target.value)} placeholder="0 9 * * *" className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 font-mono" />
            {err && <p className="text-red-400 text-xs">{err}</p>}
            <div className="flex gap-2">
              <button disabled={busy} onClick={() => create('cron')} className="px-2 py-1 rounded bg-lucy-600 text-white text-xs disabled:opacity-50">Add schedule</button>
              <button onClick={() => setAdding(null)} className="px-2 py-1 text-gray-400 text-xs">Cancel</button>
            </div>
          </div>
        )}

        {adding === 'record' && (
          <div className="rounded-lg border border-gray-700 bg-gray-800 p-2.5 space-y-2">
            <label className="block text-gray-400">When a record is changed in</label>
            <select value={recTable} onChange={(e) => setRecTable(e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200">
              {WATCHED_TABLES.map((tbl) => <option key={tbl} value={tbl}>{tbl}</option>)}
            </select>
            <div className="flex gap-3">
              {EVENT_OPS.map(({ op, label }) => (
                <label key={op} className="flex items-center gap-1 text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={recEvents.includes(op)}
                    onChange={(e) => setRecEvents((cur) => e.target.checked ? [...cur, op] : cur.filter((o) => o !== op))}
                    className="accent-lucy-500"
                  />
                  {label}
                </label>
              ))}
            </div>
            {err && <p className="text-red-400 text-xs">{err}</p>}
            <div className="flex gap-2">
              <button disabled={busy} onClick={() => create('record_event')} className="px-2 py-1 rounded bg-lucy-600 text-white text-xs disabled:opacity-50">Add trigger</button>
              <button onClick={() => setAdding(null)} className="px-2 py-1 text-gray-400 text-xs">Cancel</button>
            </div>
          </div>
        )}
      </div>
      <div className="border-t border-gray-800 p-2 flex flex-wrap gap-2">
        <button onClick={() => { setAdding('cron'); setErr(null); }} className="flex items-center gap-1 text-xs px-2 py-1 rounded text-gray-300 hover:bg-gray-800"><Plus className="w-3 h-3" /><Clock className="w-3 h-3" /> Schedule</button>
        <button disabled={busy} onClick={() => create('webhook')} className="flex items-center gap-1 text-xs px-2 py-1 rounded text-gray-300 hover:bg-gray-800"><Plus className="w-3 h-3" /><Webhook className="w-3 h-3" /> Webhook</button>
        <button onClick={() => { setAdding('record'); setErr(null); }} className="flex items-center gap-1 text-xs px-2 py-1 rounded text-gray-300 hover:bg-gray-800"><Plus className="w-3 h-3" /><Database className="w-3 h-3" /> Record event</button>
      </div>
    </div>
  );
}
