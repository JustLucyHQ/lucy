'use client';

import React from 'react';
import type { Node, NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';
import type { WorkflowNodeData, FilterNodeConfig } from '@/lib/workflow/types';

type FilterNodeType = Node<WorkflowNodeData>;

export function FilterNode({ data, selected }: NodeProps<FilterNodeType>) {
  const config = data.config as FilterNodeConfig;
  const op = config.operator.replace(/_/g, ' ');
  return (
    <BaseNode nodeType="filter" label={data.label} status={data.status} selected={selected} executionError={data.executionError}>
      <p className="text-gray-400 text-xs truncate">
        continue if input <span className="text-blue-300">{op}</span>{config.value ? ` "${config.value}"` : ''}
      </p>
    </BaseNode>
  );
}
