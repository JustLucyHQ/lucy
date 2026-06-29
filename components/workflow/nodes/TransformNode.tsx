'use client';

import React from 'react';
import type { Node, NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';
import type { WorkflowNodeData, TransformNodeConfig } from '@/lib/workflow/types';

type TransformNodeType = Node<WorkflowNodeData>;

const OP_LABELS: Record<string, string> = {
  template: 'Template',
  uppercase: 'UPPERCASE',
  lowercase: 'lowercase',
  trim: 'Trim whitespace',
  extract_json: 'Extract JSON',
  combine: 'Combine inputs',
  replace: 'Find & replace',
};

export function TransformNode({ data, selected }: NodeProps<TransformNodeType>) {
  const config = data.config as TransformNodeConfig;

  return (
    <BaseNode
      nodeType="transform"
      label={data.label}
      status={data.status}
      selected={selected}
      executionError={data.executionError}
    >
      <div className="space-y-1">
        <div className="flex items-center gap-1.5">
          <span className="px-1.5 py-0.5 bg-yellow-900/50 text-yellow-300 rounded text-xs font-medium">
            {OP_LABELS[config.operation] ?? config.operation}
          </span>
        </div>
        {config.operation === 'template' && config.template && (
          <p className="text-gray-500 truncate text-xs font-mono">{config.template}</p>
        )}
        {config.operation === 'replace' && (
          <p className="text-gray-500 text-xs truncate">
            &ldquo;{config.searchValue}&rdquo; &rarr; &ldquo;{config.replaceValue}&rdquo;
          </p>
        )}
      </div>
    </BaseNode>
  );
}
