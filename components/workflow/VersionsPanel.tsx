// components/workflow/VersionsPanel.tsx
'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { X, Upload, RotateCcw, GitCommit } from 'lucide-react';
import { useWorkflowStore } from '@/lib/workflow/store';
import type { WorkflowNode, WorkflowEdge } from '@/lib/workflow/types';

interface Version {
  id: string;
  version: number;
  name: string | null;
  definition: { name?: string; nodes?: WorkflowNode[]; edges?: WorkflowEdge[] };
  published_at: string;
}

interface Props {
  workflowId: string;
  definition: { name: string; nodes: unknown[]; edges: unknown[] };
  onClose: () => void;
}

export function VersionsPanel({ workflowId, definition, onClose }: Props) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const loadWorkflow = useWorkflowStore((s) => s.loadWorkflow);

  const load = useCallback(async () => {
    const res = await fetch(`/api/workflows/${encodeURIComponent(workflowId)}/versions`);
    if (res.ok) setVersions((await res.json()).versions ?? []);
  }, [workflowId]);
  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t); }, [load]);

  const publish = async () => {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/workflows/${encodeURIComponent(workflowId)}/versions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: definition.name, definition }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg(data?.error || 'Publish failed'); return; }
      setMsg(`Published v${data.version?.version}`);
      await load();
    } finally { setBusy(false); }
  };

  const restore = (v: Version) => {
    const nodes = (v.definition.nodes ?? []) as WorkflowNode[];
    const edges = (v.definition.edges ?? []) as WorkflowEdge[];
    loadWorkflow(workflowId, v.definition.name ?? v.name ?? 'Workflow', '', nodes, edges);
    setMsg(`Loaded v${v.version} into the editor`);
  };

  return (
    <div className="absolute right-0 top-0 h-full w-80 bg-gray-900 border-l border-gray-800 flex flex-col z-20">
      <div className="flex items-center justify-between px-4 h-10 border-b border-gray-800 shrink-0">
        <span className="text-xs font-medium text-gray-300">Versions</span>
        <button onClick={onClose} className="text-gray-600 hover:text-gray-300"><X className="w-4 h-4" /></button>
      </div>
      <div className="p-2 border-b border-gray-800">
        <button disabled={busy} onClick={publish} className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-lucy-600 text-white text-xs disabled:opacity-50">
          <Upload className="w-3.5 h-3.5" /> Publish current draft
        </button>
        {msg && <p className="text-xs text-gray-400 mt-1.5 text-center">{msg}</p>}
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {versions.length === 0 ? (
          <p className="text-xs text-gray-600 p-2">No published versions yet. The canvas is your working draft.</p>
        ) : versions.map((v) => (
          <div key={v.id} className="flex items-center gap-2 px-2 py-1.5 rounded text-xs bg-gray-800/50 border border-gray-800">
            <GitCommit className="w-3.5 h-3.5 text-lucy-400 shrink-0" />
            <span className="text-gray-200">v{v.version}</span>
            <span className="text-gray-600 flex-1 truncate">{new Date(v.published_at).toLocaleString()}</span>
            <button onClick={() => restore(v)} title="Load into editor" className="text-gray-500 hover:text-lucy-300 flex items-center gap-0.5">
              <RotateCcw className="w-3 h-3" /> restore
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
