'use client';

import React from 'react';
import type { Node, NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';
import type { WorkflowNodeData, StartNodeConfig } from '@/lib/workflow/types';

type StartNodeType = Node<WorkflowNodeData>;

export function StartNode({ data, selected }: NodeProps<StartNodeType>) {
  const config = data.config as StartNodeConfig;
  const vars = config.inputVariables ?? [];

  return (
    <BaseNode
      nodeType="start"
      label={data.label}
      status={data.status}
      selected={selected}
      executionError={data.executionError}
    >
      {vars.length > 0 ? (
        <div className="space-y-0.5">
          {vars.slice(0, 3).map((v) => (
            <div key={v.name} className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
              <span className="text-gray-300 font-mono text-xs truncate">{v.name}</span>
            </div>
          ))}
          {vars.length > 3 && (
            <span className="text-gray-500 text-xs">+{vars.length - 3} more</span>
          )}
        </div>
      ) : (
        <span className="text-gray-500 italic">No input variables</span>
      )}
    </BaseNode>
  );
}
