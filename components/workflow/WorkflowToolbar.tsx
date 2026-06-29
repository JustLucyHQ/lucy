'use client';

/**
 * WorkflowToolbar — top bar of the workflow editor.
 * Contains: back button, workflow name (editable), save button, run button.
 */

import React from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Save, Play, Loader2, CheckCircle2, AlertCircle, History, Clock, GitBranch,
} from 'lucide-react';
import { useWorkflowStore } from '@/lib/workflow/store';

interface WorkflowToolbarProps {
  onSave: () => Promise<void>;
  onRun: () => Promise<void>;
  onShowRuns?: () => void;
  onShowTriggers?: () => void;
  onShowVersions?: () => void;
  isSaving: boolean;
  saveError: string | null;
}

export function WorkflowToolbar({ onSave, onRun, onShowRuns, onShowTriggers, onShowVersions, isSaving, saveError }: WorkflowToolbarProps) {
  const workflowName = useWorkflowStore((s) => s.workflowName);
  const setWorkflowName = useWorkflowStore((s) => s.setWorkflowName);
  const executionStatus = useWorkflowStore((s) => s.executionStatus);
  const isRunning = executionStatus === 'running';

  return (
    <div className="h-12 bg-gray-900 border-b border-gray-800 flex items-center px-4 gap-3 shrink-0 z-10">
      {/* Back */}
      <Link
        href="/workflows"
        className="flex items-center gap-1.5 text-gray-400 hover:text-gray-200 transition-colors text-sm"
      >
        <ArrowLeft className="w-4 h-4" />
        <span className="hidden sm:inline">Workflows</span>
      </Link>

      <div className="w-px h-5 bg-gray-700" />

      {/* Workflow name */}
      <input
        value={workflowName}
        onChange={(e) => setWorkflowName(e.target.value)}
        className="flex-1 bg-transparent text-sm font-medium text-gray-100 placeholder-gray-600 outline-none border-b border-transparent focus:border-gray-600 py-0.5 min-w-0 max-w-xs transition-colors"
        placeholder="Untitled Workflow"
      />

      <div className="ml-auto flex items-center gap-2">
        {/* Save status */}
        {saveError && (
          <div className="flex items-center gap-1 text-red-400 text-xs">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Save failed</span>
          </div>
        )}

        {/* Versions button */}
        {onShowVersions && (
          <button
            onClick={onShowVersions}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
          >
            <GitBranch className="w-3.5 h-3.5" />
            <span>Versions</span>
          </button>
        )}

        {/* Triggers button */}
        {onShowTriggers && (
          <button
            onClick={onShowTriggers}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Triggers</span>
          </button>
        )}

        {/* See Runs button */}
        {onShowRuns && (
          <button
            onClick={onShowRuns}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
          >
            <History className="w-3.5 h-3.5" />
            <span>See Runs</span>
          </button>
        )}

        {/* Save button */}
        <button
          onClick={onSave}
          disabled={isSaving}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700 hover:text-white disabled:opacity-50 transition-colors"
        >
          {isSaving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Save className="w-3.5 h-3.5" />
          )}
          <span>{isSaving ? 'Saving…' : 'Save'}</span>
        </button>

        {/* Run button */}
        <button
          onClick={onRun}
          disabled={isRunning}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-lucy-600 border border-lucy-600 text-white hover:bg-lucy-500 disabled:opacity-60 transition-colors"
        >
          {isRunning ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Play className="w-3.5 h-3.5 fill-current" />
          )}
          <span>{isRunning ? 'Running…' : 'Run'}</span>
        </button>
      </div>
    </div>
  );
}
