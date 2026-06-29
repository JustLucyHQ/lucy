'use client';

/**
 * /workflows — Workflow list page.
 * Shows a grid of workflow cards with name, description, node count, last edited.
 */

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, GitBranch, Trash2, Loader2, Clock, Layers, BookTemplate } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { getWorkflowStorage } from '@/lib/workflow/storage';
import { WORKFLOW_TEMPLATES } from '@/lib/workflow/templates';
import { buildExampleWorkflows } from '@/lib/workflow/examples';
import type { Workflow } from '@/lib/workflow/types';

/** Build a fresh Workflow instance from a template (timestamps assigned here). */
function instantiateTemplate(workflow: Omit<Workflow, 'id' | 'createdAt' | 'updatedAt'>): Workflow {
  const now = Date.now();
  return { id: '', ...workflow, createdAt: now, updatedAt: now };
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const router = useRouter();

  // Durable Supabase storage when connected + authed, else localStorage.
  const storage = React.useMemo(() => getWorkflowStorage(), []);

  useEffect(() => {
    storage
      .listWorkflows()
      .then(setWorkflows)
      .finally(() => setLoading(false));
  }, [storage]);

  const handleLoadExamples = async () => {
    setLoading(true);
    try {
      // Dedupe by name so re-clicking (or Supabase mode, where saves always
      // insert rather than upsert) doesn't create duplicates.
      const existing = await storage.listWorkflows();
      const have = new Set(existing.map((w) => w.name));
      for (const wf of buildExampleWorkflows()) {
        if (!have.has(wf.name)) await storage.saveWorkflow(wf);
      }
      setWorkflows(await storage.listWorkflows());
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('Delete this workflow?')) return;
    setDeletingId(id);
    try {
      await storage.deleteWorkflow(id);
      setWorkflows((wfs) => wfs.filter((w) => w.id !== id));
    } finally {
      setDeletingId(null);
    }
  };

  const handleNew = async () => {
    const saved = await storage.saveWorkflow(
      instantiateTemplate({
        name: 'Untitled Workflow',
        description: '',
        nodes: [],
        edges: [],
        isPublished: false,
      })
    );
    router.push(`/workflows/${saved.id}`);
  };

  const handleUseTemplate = async (templateId: string) => {
    const template = WORKFLOW_TEMPLATES.find((t) => t.id === templateId);
    if (!template) return;
    const saved = await storage.saveWorkflow(instantiateTemplate(template.workflow));
    router.push(`/workflows/${saved.id}`);
  };

  return (
    <AppShell title="Workflows">
        <div className="max-w-5xl mx-auto px-6 py-8">
          {/* Page header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold text-white">Workflows</h1>
              <p className="text-gray-400 text-sm mt-1">
                Build AI pipelines with drag-and-drop node graphs
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleLoadExamples}
                className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 rounded-lg text-sm font-medium transition-colors"
                title="Add 15 ready-to-run example workflows"
              >
                <BookTemplate className="w-4 h-4" />
                Load examples
              </button>
              <button
                onClick={handleNew}
                className="flex items-center gap-2 px-4 py-2 bg-lucy-600 hover:bg-lucy-500 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <Plus className="w-4 h-4" />
                New Workflow
              </button>
            </div>
          </div>

          {/* Content */}
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="w-6 h-6 text-gray-600 animate-spin" />
            </div>
          ) : workflows.length === 0 ? (
            <div className="space-y-10">
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-16 h-16 rounded-2xl bg-gray-800 flex items-center justify-center mb-4">
                  <GitBranch className="w-8 h-8 text-gray-600" />
                </div>
                <h2 className="text-gray-300 font-semibold text-lg mb-2">No workflows yet</h2>
                <p className="text-gray-500 text-sm mb-6 max-w-sm">
                  Start from a template or create a blank workflow.
                </p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleNew}
                    className="flex items-center gap-2 px-4 py-2 bg-lucy-600 hover:bg-lucy-500 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Blank Workflow
                  </button>
                  <button
                    onClick={handleLoadExamples}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 rounded-lg text-sm font-medium transition-colors"
                  >
                    <BookTemplate className="w-4 h-4" />
                    Load 15 examples
                  </button>
                </div>
              </div>

              {WORKFLOW_TEMPLATES.length > 0 && (
                <div>
                  <h3 className="text-gray-300 font-semibold text-sm mb-4 flex items-center gap-2">
                    <BookTemplate className="w-4 h-4 text-gray-500" />
                    Templates
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {WORKFLOW_TEMPLATES.map((tmpl) => (
                      <button
                        key={tmpl.id}
                        onClick={() => handleUseTemplate(tmpl.id)}
                        className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-lucy-600 transition-all text-left group"
                      >
                        <div className="text-2xl mb-3">{tmpl.icon}</div>
                        <h4 className="text-white font-semibold text-sm mb-1 group-hover:text-lucy-400 transition-colors">
                          {tmpl.name}
                        </h4>
                        <p className="text-gray-500 text-xs line-clamp-2">
                          {tmpl.description}
                        </p>
                        <div className="flex items-center gap-2 mt-3 text-xs text-gray-600">
                          <Layers className="w-3 h-3" />
                          {tmpl.workflow.nodes.length} nodes
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {workflows.map((wf) => (
                <Link key={wf.id} href={`/workflows/${wf.id}`}>
                  <div className="group relative bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-600 transition-all duration-150 cursor-pointer h-full">
                    {/* Delete button */}
                    <button
                      onClick={(e) => handleDelete(wf.id, e)}
                      disabled={deletingId === wf.id}
                      className="absolute top-3 right-3 p-1.5 rounded-md text-gray-700 hover:text-red-400 hover:bg-gray-800 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      {deletingId === wf.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </button>

                    {/* Icon */}
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-lucy-600 to-lucy-800 flex items-center justify-center mb-3">
                      <GitBranch className="w-5 h-5 text-white" />
                    </div>

                    {/* Name */}
                    <h3 className="text-white font-semibold text-sm mb-1 pr-6 truncate">
                      {wf.name}
                    </h3>

                    {/* Description */}
                    {wf.description && (
                      <p className="text-gray-500 text-xs mb-3 line-clamp-2">{wf.description}</p>
                    )}

                    {/* Meta */}
                    <div className="flex items-center gap-3 text-xs text-gray-600 mt-auto pt-2 border-t border-gray-800">
                      <span className="flex items-center gap-1">
                        <Layers className="w-3 h-3" />
                        {wf.nodes.length} node{wf.nodes.length !== 1 ? 's' : ''}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {timeAgo(wf.updatedAt)}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}

              {/* "New" card */}
              <button
                onClick={handleNew}
                className="bg-gray-900/50 border border-dashed border-gray-700 rounded-xl p-5 hover:border-gray-500 hover:bg-gray-900 transition-all duration-150 flex flex-col items-center justify-center gap-2 min-h-[140px]"
              >
                <div className="w-10 h-10 rounded-lg border-2 border-dashed border-gray-700 flex items-center justify-center">
                  <Plus className="w-5 h-5 text-gray-600" />
                </div>
                <span className="text-gray-500 text-sm">New Workflow</span>
              </button>
            </div>

            {WORKFLOW_TEMPLATES.length > 0 && (
              <div className="mt-10">
                <h3 className="text-gray-400 font-semibold text-xs uppercase tracking-wider mb-3 flex items-center gap-2">
                  <BookTemplate className="w-3.5 h-3.5" />
                  Templates
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {WORKFLOW_TEMPLATES.map((tmpl) => (
                    <button
                      key={tmpl.id}
                      onClick={() => handleUseTemplate(tmpl.id)}
                      className="bg-gray-900/50 border border-gray-800 rounded-lg p-4 hover:border-lucy-600 transition-all text-left text-xs"
                    >
                      <span className="mr-2">{tmpl.icon}</span>
                      <span className="text-gray-300 font-medium">{tmpl.name}</span>
                      <p className="text-gray-600 mt-1 line-clamp-1">{tmpl.description}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
            </>
          )}
        </div>
    </AppShell>
  );
}
