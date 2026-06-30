'use client';

/**
 * /workflows/[id] — Workflow editor page.
 *
 * Loads the workflow from storage, sets up the Zustand store,
 * and renders the full editor layout:
 *   WorkflowToolbar (top)
 *   NodePanel (left) | WorkflowCanvas (center) | NodeConfigPanel (right)
 *   RunPanel (bottom, visible during/after execution)
 *
 * "Run" opens a modal to enter input values, then executes the workflow
 * using WorkflowEngine — calling real AI APIs for LLM nodes.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Loader2, X, Play } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { WorkflowCanvas } from '@/components/workflow/WorkflowCanvas';
import { WorkflowToolbar } from '@/components/workflow/WorkflowToolbar';
import { NodePanel } from '@/components/workflow/NodePanel';
import { NodeConfigPanel } from '@/components/workflow/NodeConfigPanel';
import { RunPanel } from '@/components/workflow/RunPanel';
import { RunsHistory } from '@/components/workflow/RunsHistory';
import { TriggersPanel } from '@/components/workflow/TriggersPanel';
import { VersionsPanel } from '@/components/workflow/VersionsPanel';
import { useWorkflowStore } from '@/lib/workflow/store';
import { getWorkflowStorage } from '@/lib/workflow/storage';
import { WorkflowEngine } from '@/lib/workflow/engine';
import { useSettingsStore } from '@/lib/store/settings';
import { isSupabaseEnabled } from '@/lib/supabase/client';
import type { Workflow, StartNodeConfig, ExecutionLogEntry } from '@/lib/workflow/types';

// ─── Run inputs modal ──────────────────────────────────────────────────────

interface RunModalProps {
  variables: Array<{ name: string; description: string; defaultValue: string }>;
  onRun: (inputs: Record<string, string>) => void;
  onClose: () => void;
}

function RunModal({ variables, onRun, onClose }: RunModalProps) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const defaults: Record<string, string> = {};
    for (const v of variables) defaults[v.name] = v.defaultValue ?? '';
    return defaults;
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onRun(values);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-white">Run Workflow</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="px-5 py-4 space-y-3">
            {variables.length === 0 ? (
              <p className="text-gray-500 text-sm">
                This workflow has no input variables. It will run with no inputs.
              </p>
            ) : (
              variables.map((v) => (
                <div key={v.name} className="space-y-1">
                  <label className="text-xs font-medium text-gray-400">
                    {v.name}
                    {v.description && (
                      <span className="text-gray-600 font-normal ml-2">{v.description}</span>
                    )}
                  </label>
                  <textarea
                    rows={2}
                    className="w-full bg-gray-800 border border-gray-700 rounded-md px-2.5 py-2 text-xs text-gray-100 placeholder-gray-600 focus:outline-none focus:border-lucy-500 focus:ring-1 focus:ring-lucy-500 resize-none"
                    value={values[v.name] ?? ''}
                    onChange={(e) =>
                      setValues((prev) => ({ ...prev, [v.name]: e.target.value }))
                    }
                    placeholder={v.defaultValue || `Enter ${v.name}…`}
                  />
                </div>
              ))
            )}
          </div>

          <div className="flex justify-end gap-2 px-5 pb-5">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200 border border-gray-700 rounded-md transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-4 py-1.5 bg-lucy-600 hover:bg-lucy-500 text-white rounded-md text-xs font-medium transition-colors"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              Run
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────

export default function WorkflowEditorPage() {
  const params = useParams();
  const id = params?.id as string;

  const [pageLoading, setPageLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showRunModal, setShowRunModal] = useState(false);
  const [showRuns, setShowRuns] = useState(false);
  const [showTriggers, setShowTriggers] = useState(false);
  const [showVersions, setShowVersions] = useState(false);

  // Zustand store
  const loadWorkflow = useWorkflowStore((s) => s.loadWorkflow);
  const workflowId = useWorkflowStore((s) => s.workflowId);
  const workflowName = useWorkflowStore((s) => s.workflowName);
  const workflowDescription = useWorkflowStore((s) => s.workflowDescription);
  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);
  const setWorkflowId = useWorkflowStore((s) => s.setWorkflowId);
  const setExecutionStatus = useWorkflowStore((s) => s.setExecutionStatus);
  const appendLog = useWorkflowStore((s) => s.appendLog);
  const setFinalOutput = useWorkflowStore((s) => s.setFinalOutput);
  const setExecutionError = useWorkflowStore((s) => s.setExecutionError);
  const resetExecution = useWorkflowStore((s) => s.resetExecution);
  const updateNodeStatus = useWorkflowStore((s) => s.updateNodeStatus);
  const resetNodeStatuses = useWorkflowStore((s) => s.resetNodeStatuses);
  const setExecutionAttempt = useWorkflowStore((s) => s.setExecutionAttempt);

  const storage = React.useMemo(() => getWorkflowStorage(), []);

  // ── Load workflow on mount ─────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      setPageLoading(true);
      setLoadError(null);
      try {
        const wf = await storage.getWorkflow(id);
        if (!wf) {
          setLoadError('Workflow not found');
          return;
        }
        loadWorkflow(wf.id, wf.name, wf.description, wf.nodes, wf.edges);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Failed to load workflow');
      } finally {
        setPageLoading(false);
      }
    }
    load();
    // Reset execution state when navigating to editor
    resetExecution();
    resetNodeStatuses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ── Save ──────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setSaveError(null);
    try {
      const wf: Workflow = {
        id: workflowId || id,
        name: workflowName,
        description: workflowDescription,
        nodes,
        edges,
        isPublished: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const saved = await storage.saveWorkflow(wf);
      // Update ID if it changed (new workflow)
      if (saved.id !== workflowId) {
        setWorkflowId(saved.id);
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setIsSaving(false);
    }
  }, [workflowId, id, workflowName, workflowDescription, nodes, edges, storage, setWorkflowId]);

  // ── Run ───────────────────────────────────────────────────────────────

  const startNode = nodes.find((n) => n.data.nodeType === 'start');
  const inputVariables = startNode
    ? (startNode.data.config as StartNodeConfig).inputVariables ?? []
    : [];

  const handleRunClick = useCallback(async () => {
    setShowRunModal(true);
  }, []);

  const handleRunConfirm = useCallback(
    async (inputs: Record<string, string>) => {
      setShowRunModal(false);
      resetExecution();
      resetNodeStatuses();
      setExecutionStatus('running');

      // Load API keys from the settings store — hydrated from the active
      // storage adapter (Supabase in connected mode, localStorage standalone),
      // so workflow LLM nodes use the same keys as chat.
      const storeKeys = useSettingsStore.getState().apiKeys;
      const apiKeys: Record<string, string> = {};
      for (const [provider, key] of Object.entries(storeKeys)) {
        if (key) apiKeys[provider] = key;
      }

      const definition: Workflow = {
        id: workflowId || id,
        name: workflowName,
        description: workflowDescription,
        nodes,
        edges,
        isPublished: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      // Connected mode → durable server run + poll. Standalone → client engine.
      if (isSupabaseEnabled()) {
        try {
          const res = await fetch('/api/workflows/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ workflowId: workflowId || id, definition, inputs }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data?.error || `Run failed (HTTP ${res.status})`);
          const runId: string = data.runId;

          // Poll until terminal; reflect logs + per-node status into the store.
          for (;;) {
            await new Promise((r) => setTimeout(r, 1000));
            const g = await fetch(`/api/workflows/runs/${runId}`);
            if (!g.ok) throw new Error('Lost the run');
            const { run } = await g.json();
            resetExecution();
            for (const entry of (run.logs ?? []) as ExecutionLogEntry[]) {
              appendLog(entry);
              updateNodeStatus(entry.nodeId, entry.status, entry.output, entry.error);
            }
            if (run.status === 'succeeded') {
              setExecutionStatus('completed');
              setExecutionAttempt(null);
              if (run.outputs?.finalOutput) setFinalOutput(run.outputs.finalOutput);
              break;
            }
            if (run.status === 'failed') {
              setExecutionStatus('error');
              setExecutionAttempt(null);
              setExecutionError(run.error || 'Workflow failed');
              break;
            }
            if (run.status === 'canceled') {
              setExecutionStatus('canceled');
              setExecutionAttempt(null);
              break;
            }
            // queued (incl. retry backoff) or running — surface the attempt count
            setExecutionStatus(run.status === 'queued' ? 'queued' : 'running');
            setExecutionAttempt(
              typeof run.attempt === 'number' && typeof run.max_attempts === 'number'
                ? { attempt: run.attempt, max: run.max_attempts }
                : null
            );
          }
        } catch (err) {
          setExecutionStatus('error');
          setExecutionAttempt(null);
          setExecutionError(err instanceof Error ? err.message : 'Execution failed');
        }
        return;
      }

      const engine = new WorkflowEngine(definition, {
        onNodeStart: (nodeId) => updateNodeStatus(nodeId, 'running'),
        onNodeEnd: (nodeId, status, output, error) => updateNodeStatus(nodeId, status, output, error),
        onLog: (entry) => appendLog(entry),
      });

      try {
        const result = await engine.execute(inputs, apiKeys);
        setExecutionStatus(result.status);
        if (result.finalOutput) setFinalOutput(result.finalOutput);
        if (result.error) setExecutionError(result.error);
      } catch (err) {
        setExecutionStatus('error');
        setExecutionError(err instanceof Error ? err.message : 'Execution failed');
      }
    },
    [
      workflowId, id, workflowName, workflowDescription, nodes, edges,
      resetExecution, resetNodeStatuses, setExecutionStatus, appendLog,
      setFinalOutput, setExecutionError, updateNodeStatus, setExecutionAttempt,
    ]
  );

  // ── Render ────────────────────────────────────────────────────────────

  if (pageLoading) {
    return (
      <AppShell title="Workflow" padded={false}>
        <div className="flex h-full items-center justify-center">
          <Loader2 className="w-6 h-6 text-gray-600 animate-spin" />
        </div>
      </AppShell>
    );
  }

  if (loadError) {
    return (
      <AppShell title="Workflow" padded={false}>
        <div className="flex h-full items-center justify-center text-red-400">
          {loadError}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Workflow" padded={false}>
      <div className="flex flex-col h-full bg-gray-950">
        <WorkflowToolbar
          onSave={handleSave}
          onRun={handleRunClick}
          onShowRuns={() => { setShowRuns((v) => !v); setShowTriggers(false); setShowVersions(false); }}
          onShowTriggers={() => { setShowTriggers((v) => !v); setShowRuns(false); setShowVersions(false); }}
          onShowVersions={() => { setShowVersions((v) => !v); setShowRuns(false); setShowTriggers(false); }}
          isSaving={isSaving}
          saveError={saveError}
        />

        <div className="relative flex flex-1 min-h-0">
          <NodePanel />
          <WorkflowCanvas />
          <NodeConfigPanel />
          {showRuns && (
            <RunsHistory workflowId={workflowId || id} onClose={() => setShowRuns(false)} />
          )}
          {showTriggers && (
            <TriggersPanel
              workflowId={workflowId || id}
              definition={{ name: workflowName, nodes, edges }}
              onClose={() => setShowTriggers(false)}
            />
          )}
          {showVersions && (
            <VersionsPanel
              workflowId={workflowId || id}
              definition={{ name: workflowName, nodes, edges }}
              onClose={() => setShowVersions(false)}
            />
          )}
        </div>

        <RunPanel />

        {showRunModal && (
          <RunModal
            variables={inputVariables}
            onRun={handleRunConfirm}
            onClose={() => setShowRunModal(false)}
          />
        )}
      </div>
    </AppShell>
  );
}
