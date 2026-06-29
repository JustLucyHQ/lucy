'use client';

import React from 'react';
import type { Node, NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';
import type { WorkflowNodeData, HttpNodeConfig } from '@/lib/workflow/types';

type HttpNodeType = Node<WorkflowNodeData>;

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-emerald-900/50 text-emerald-300',
  POST: 'bg-blue-900/50 text-blue-300',
  PUT: 'bg-yellow-900/50 text-yellow-300',
  DELETE: 'bg-red-900/50 text-red-300',
  PATCH: 'bg-orange-900/50 text-orange-300',
};

export function HttpNode({ data, selected }: NodeProps<HttpNodeType>) {
  const config = data.config as HttpNodeConfig;

  // Truncate URL for display
  let displayUrl = config.url;
  try {
    const u = new URL(config.url);
    displayUrl = u.hostname + (u.pathname !== '/' ? u.pathname : '');
  } catch {
    // keep as-is
  }

  return (
    <BaseNode
      nodeType="http"
      label={data.label}
      status={data.status}
      selected={selected}
      executionError={data.executionError}
    >
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${METHOD_COLORS[config.method] ?? 'bg-gray-800 text-gray-300'}`}>
            {config.method}
          </span>
        </div>
        <p className="text-gray-400 truncate text-xs font-mono">{displayUrl}</p>
      </div>
    </BaseNode>
  );
}
