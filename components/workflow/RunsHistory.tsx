// components/workflow/RunsHistory.tsx
'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { X, Loader2, CheckCircle2, AlertCircle, Clock, Ban } from 'lucide-react';

interface RunSummary {
  id: string; status: string; name: string | null; error: string | null;
  enqueued_at: string; started_at: string | null; completed_at: string | null;
}

function statusIcon(status: string) {
  if (status === 'running' || status === 'queued') return <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />;
  if (status === 'succeeded') return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
  if (status === 'failed') return <AlertCircle className="w-3.5 h-3.5 text-red-400" />;
  if (status === 'canceled') return <Ban className="w-3.5 h-3.5 text-gray-500" />;
  return <Clock className="w-3.5 h-3.5 text-gray-500" />;
}

export function RunsHistory({ workflowId, onClose }: { workflowId: string; onClose: () => void }) {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/workflows/runs?workflowId=${encodeURIComponent(workflowId)}&limit=30`);
      const data = await res.json();
      setRuns(data.runs ?? []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [workflowId]);

  useEffect(() => {
    // Kick the first load + poll from timer callbacks so state updates happen
    // asynchronously (outside the synchronous effect body).
    const first = setTimeout(load, 0);
    const t = setInterval(load, 3000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [load]);

  const cancelRun = async (id: string) => {
    try {
      await fetch(`/api/workflows/runs/${id}/cancel`, { method: 'POST' });
    } catch { /* ignore */ }
    load();
  };

  return (
    <div className="absolute right-0 top-0 h-full w-80 bg-gray-900 border-l border-gray-800 flex flex-col z-20">
      <div className="flex items-center justify-between px-4 h-10 border-b border-gray-800 shrink-0">
        <span className="text-xs font-medium text-gray-300">Runs</span>
        <button onClick={onClose} className="text-gray-600 hover:text-gray-300"><X className="w-4 h-4" /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {loading ? (
          <p className="text-xs text-gray-600 p-2">Loading…</p>
        ) : runs.length === 0 ? (
          <p className="text-xs text-gray-600 p-2">No runs yet. Click Run to start one.</p>
        ) : runs.map((r) => {
          const dur = r.completed_at && r.started_at
            ? `${Math.max(0, Math.round((new Date(r.completed_at).getTime() - new Date(r.started_at).getTime()) / 100) / 10)}s`
            : '';
          return (
            <div key={r.id} className="flex items-center gap-2 px-2 py-1.5 rounded text-xs bg-gray-800/50 border border-gray-800">
              {statusIcon(r.status)}
              <span className="text-gray-300 flex-1 truncate">{r.status}{r.error ? ` — ${r.error}` : ''}</span>
              <span className="text-gray-600">{dur}</span>
              <span className="text-gray-600">{new Date(r.enqueued_at).toLocaleTimeString()}</span>
              {(r.status === 'queued' || r.status === 'running') && (
                <button onClick={() => cancelRun(r.id)} className="text-gray-500 hover:text-red-400 shrink-0">cancel</button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
