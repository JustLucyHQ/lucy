'use client';

import React from 'react';
import type { Node, NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';
import type { WorkflowNodeData, LLMNodeConfig } from '@/lib/workflow/types';

type LLMNodeType = Node<WorkflowNodeData>;

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
};

export function LLMNode({ data, selected }: NodeProps<LLMNodeType>) {
  const config = data.config as LLMNodeConfig;
  const firstLine = config.systemPrompt?.split('\n')[0] ?? '';

  return (
    <BaseNode
      nodeType="llm"
      label={data.label}
      status={data.status}
      selected={selected}
      executionOutput={data.executionOutput}
      executionError={data.executionError}
    >
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <span className="px-1.5 py-0.5 bg-purple-900/60 text-purple-300 rounded text-xs font-medium">
            {PROVIDER_LABELS[config.provider] ?? config.provider}
          </span>
          <span className="text-gray-300 text-xs truncate">{config.model}</span>
        </div>
        {firstLine && (
          <p className="text-gray-500 truncate text-xs">{firstLine}</p>
        )}
        <div className="flex items-center gap-2 text-gray-600 text-xs">
          <span>temp: {config.temperature}</span>
          <span>•</span>
          <span>max: {config.maxTokens}</span>
        </div>
      </div>
    </BaseNode>
  );
}
