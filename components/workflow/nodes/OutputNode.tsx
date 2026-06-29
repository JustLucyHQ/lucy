'use client';

import React from 'react';
import type { Node, NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';
import type { WorkflowNodeData, OutputNodeConfig } from '@/lib/workflow/types';

type OutputNodeType = Node<WorkflowNodeData>;

export function OutputNode({ data, selected }: NodeProps<OutputNodeType>) {
  const config = data.config as OutputNodeConfig;

  return (
    <BaseNode
      nodeType="output"
      label={data.label}
      status={data.status}
      selected={selected}
      executionError={data.executionError}
    >
      <div className="space-y-1">
        <div className="flex items-center gap-1.5">
          <span className="text-gray-500 text-xs">Display:</span>
          <span className="text-gray-300 text-xs">{config.displayName}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-gray-500 text-xs">Format:</span>
          <span className="px-1.5 py-0.5 bg-emerald-900/50 text-emerald-300 rounded text-xs">
            {config.format}
          </span>
        </div>
        {data.executionOutput && (
          <p className="text-gray-400 text-xs truncate mt-1 border-t border-gray-800 pt-1">
            {data.executionOutput.slice(0, 80)}
            {data.executionOutput.length > 80 ? '…' : ''}
          </p>
        )}
      </div>
    </BaseNode>
  );
}
