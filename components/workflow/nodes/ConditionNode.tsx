'use client';

import React from 'react';
import type { Node, NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import { BaseNode } from './BaseNode';
import type { WorkflowNodeData, ConditionNodeConfig } from '@/lib/workflow/types';

type ConditionNodeType = Node<WorkflowNodeData>;

const OPERATOR_LABELS: Record<string, string> = {
  contains: 'contains',
  not_contains: "doesn't contain",
  equals: 'equals',
  not_equals: 'not equals',
  greater_than: '>',
  less_than: '<',
  regex: 'matches regex',
  starts_with: 'starts with',
  ends_with: 'ends with',
};

export function ConditionNode({ data, selected }: NodeProps<ConditionNodeType>) {
  const config = data.config as ConditionNodeConfig;

  const customHandles = (
    <>
      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-gray-600 !border-2 !border-gray-400"
      />
      {/* True branch — upper-right */}
      <Handle
        type="source"
        position={Position.Right}
        id="true"
        style={{ top: '35%' }}
        className="!w-3 !h-3 !bg-emerald-600 !border-2 !border-emerald-400"
      />
      {/* False branch — lower-right */}
      <Handle
        type="source"
        position={Position.Right}
        id="false"
        style={{ top: '65%' }}
        className="!w-3 !h-3 !bg-red-600 !border-2 !border-red-400"
      />
    </>
  );

  return (
    <BaseNode
      nodeType="condition"
      label={data.label}
      status={data.status}
      selected={selected}
      customHandles={customHandles}
      executionError={data.executionError}
    >
      <div className="space-y-1.5">
        <p className="text-gray-300 text-xs">
          If{' '}
          <span className="text-blue-300 font-mono">{config.field}</span>{' '}
          <span className="text-gray-400">{OPERATOR_LABELS[config.operator]}</span>{' '}
          {config.value && (
            <span className="text-blue-300 font-mono">&ldquo;{config.value}&rdquo;</span>
          )}
        </p>
        {/* True/False labels aligned with handles */}
        <div className="flex flex-col items-end gap-3 pr-1 mt-2">
          <span className="text-xs text-emerald-400 font-medium">True</span>
          <span className="text-xs text-red-400 font-medium">False</span>
        </div>
      </div>
    </BaseNode>
  );
}
