'use client';

/**
 * RunPanel — bottom panel showing workflow execution logs.
 */

import React from 'react';
import { CheckCircle2, AlertCircle, Loader2, Circle, ChevronUp, ChevronDown, Ban, Clock } from 'lucide-react';
import { useWorkflowStore } from '@/lib/workflow/store';
import type { NodeStatus } from '@/lib/workflow/types';

function StatusBadge({ status }: { status: NodeStatus }) {
  switch (status) {
    case 'running':
      return (
        <span className="flex items-center gap-1 text-blue-400">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>running</span>
        </span>
      );
    case 'success':
      return (
        <span className="flex items-center gap-1 text-emerald-400">
          <CheckCircle2 className="w-3 h-3" />
          <span>success</span>
        </span>
      );
    case 'error':
      return (
        <span className="flex items-center gap-1 text-red-400">
          <AlertCircle className="w-3 h-3" />
          <span>error</span>
        </span>
      );
    default:
      return (
        <span className="flex items-center gap-1 text-gray-500">
          <Circle className="w-3 h-3" />
          <span>idle</span>
        </span>
      );
  }
}

/** Pretty-print a value as JSON when it parses; otherwise return it unchanged. */
function tryFormatJson(value: string): { ok: boolean; text: string } {
  try {
    return { ok: true, text: JSON.stringify(JSON.parse(value), null, 2) };
  } catch {
    return { ok: false, text: value };
  }
}

export function RunPanel() {
  const executionStatus = useWorkflowStore((s) => s.executionStatus);
  const logs = useWorkflowStore((s) => s.executionLogs);
  const finalOutput = useWorkflowStore((s) => s.finalOutput);
  const executionError = useWorkflowStore((s) => s.executionError);
  const executionAttempt = useWorkflowStore((s) => s.executionAttempt);
  const [collapsed, setCollapsed] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<'logs' | 'output'>('logs');
  const [outputView, setOutputView] = React.useState<'text' | 'json'>('text');
  const logsEndRef = React.useRef<HTMLDivElement>(null);

  // Auto-scroll logs
  React.useEffect(() => {
    if (!collapsed && activeTab === 'logs') {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, collapsed, activeTab]);

  if (executionStatus === 'idle' && logs.length === 0) return null;

  return (
    <div
      className={`border-t border-gray-800 bg-gray-900 flex flex-col transition-all duration-200 ${
        collapsed ? 'h-10' : 'h-56'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-10 shrink-0 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            {executionStatus === 'queued' && <Clock className="w-3.5 h-3.5 text-amber-400" />}
            {executionStatus === 'running' && (
              <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
            )}
            {executionStatus === 'completed' && (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            )}
            {executionStatus === 'error' && (
              <AlertCircle className="w-3.5 h-3.5 text-red-400" />
            )}
            {executionStatus === 'canceled' && <Ban className="w-3.5 h-3.5 text-gray-400" />}
            <span className="text-xs font-medium text-gray-300">
              {executionStatus === 'queued'
                ? 'Queued…'
                : executionStatus === 'running'
                ? 'Running…'
                : executionStatus === 'completed'
                ? 'Completed'
                : executionStatus === 'error'
                ? 'Error'
                : executionStatus === 'canceled'
                ? 'Canceled'
                : 'Execution Log'}
            </span>
            {executionAttempt && executionAttempt.max > 1 && (
              <span className="text-[10px] font-medium text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded px-1.5 py-0.5">
                retry {executionAttempt.attempt}/{executionAttempt.max}
              </span>
            )}
          </div>

          {!collapsed && (
            <div className="flex gap-1">
              {(['logs', 'output'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-2.5 py-0.5 rounded text-xs capitalize transition-colors ${
                    activeTab === tab
                      ? 'bg-gray-700 text-white'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="text-gray-600 hover:text-gray-300 transition-colors"
        >
          {collapsed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Body */}
      {!collapsed && (
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'logs' && (
            <div className="p-3 space-y-1 font-mono">
              {logs.map((entry, i) => (
                <div key={i} className="flex items-start gap-3 text-xs py-1 border-b border-gray-800/50">
                  <span className="text-gray-600 w-5 text-right shrink-0">{i + 1}</span>
                  <span className="text-gray-400 w-28 shrink-0 truncate">{entry.nodeLabel}</span>
                  <StatusBadge status={entry.status} />
                  {entry.duration !== undefined && (
                    <span className="text-gray-600">{entry.duration}ms</span>
                  )}
                  {entry.error && (
                    <span className="text-red-400 truncate">{entry.error}</span>
                  )}
                  {entry.output && entry.status === 'success' && (
                    <span className="text-gray-500 truncate flex-1">{entry.output.slice(0, 100)}</span>
                  )}
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          )}

          {activeTab === 'output' && (
            <div className="p-4">
              {executionError ? (
                <div className="text-red-400 text-xs font-mono bg-red-900/20 border border-red-800 rounded-md p-3">
                  {executionError}
                </div>
              ) : finalOutput ? (
                (() => {
                  const json = tryFormatJson(finalOutput);
                  const showJson = outputView === 'json' && json.ok;
                  return (
                    <>
                      <div className="flex items-center gap-1 mb-2">
                        {(['text', 'json'] as const).map((v) => (
                          <button
                            key={v}
                            onClick={() => setOutputView(v)}
                            disabled={v === 'json' && !json.ok}
                            title={v === 'json' && !json.ok ? 'Output is not valid JSON' : `View as ${v}`}
                            className={`px-2 py-0.5 rounded text-[11px] uppercase tracking-wide transition-colors ${
                              outputView === v
                                ? 'bg-gray-700 text-white'
                                : 'text-gray-500 hover:text-gray-300'
                            } ${v === 'json' && !json.ok ? 'opacity-40 cursor-not-allowed' : ''}`}
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                      <pre className="text-gray-300 text-xs font-mono whitespace-pre-wrap leading-relaxed">
                        {showJson ? json.text : finalOutput}
                      </pre>
                    </>
                  );
                })()
              ) : (
                <p className="text-gray-600 text-xs">No output yet.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
