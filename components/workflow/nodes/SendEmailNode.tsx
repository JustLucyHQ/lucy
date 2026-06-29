'use client';

import React from 'react';
import type { Node, NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';
import type { WorkflowNodeData, SendEmailNodeConfig } from '@/lib/workflow/types';

type SendEmailNodeType = Node<WorkflowNodeData>;

export function SendEmailNode({ data, selected }: NodeProps<SendEmailNodeType>) {
  const config = data.config as SendEmailNodeConfig;
  return (
    <BaseNode nodeType="sendEmail" label={data.label} status={data.status} selected={selected} executionError={data.executionError}>
      <p className="text-gray-400 text-xs truncate">to {config.to || <span className="text-red-300">(no recipient)</span>}</p>
    </BaseNode>
  );
}
