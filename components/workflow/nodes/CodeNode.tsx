'use client';

import React from 'react';
import type { Node, NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';
import type { WorkflowNodeData, CodeNodeConfig } from '@/lib/workflow/types';

type CodeNodeType = Node<WorkflowNodeData>;

export function CodeNode({ data, selected }: NodeProps<CodeNodeType>) {
  const config = data.config as CodeNodeConfig;
  const firstLine = (config.code || '').split('\n').find((l) => l.trim() && !l.trim().startsWith('//')) ?? '';
  return (
    <BaseNode nodeType="code" label={data.label} status={data.status} selected={selected} executionError={data.executionError}>
      <p className="text-gray-400 text-xs font-mono truncate">{firstLine || 'JavaScript'}</p>
    </BaseNode>
  );
}
