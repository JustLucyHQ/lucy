'use client';

import React from 'react';
import type { Node, NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';
import type { WorkflowNodeData, KnowledgeBaseNodeConfig } from '@/lib/workflow/types';

type KBNodeType = Node<WorkflowNodeData>;

export function KnowledgeBaseNode({ data, selected }: NodeProps<KBNodeType>) {
  const config = data.config as KnowledgeBaseNodeConfig;

  return (
    <BaseNode
      nodeType="knowledgeBase"
      label={data.label}
      status={data.status}
      selected={selected}
      executionError={data.executionError}
    >
      <div className="space-y-1">
        <div className="flex items-center gap-1.5">
          <span className="text-gray-500 text-xs">Collection:</span>
          <span className="text-amber-300 text-xs truncate font-mono">
            {config.collectionName || 'not set'}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-gray-500 text-xs">Top K:</span>
          <span className="text-gray-300 text-xs">{config.topK}</span>
        </div>
      </div>
    </BaseNode>
  );
}
