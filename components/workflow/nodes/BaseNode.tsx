'use client';

/**
 * BaseNode — shared wrapper for all workflow node components.
 *
 * Renders a colored header bar, icon, label, status indicator,
 * and source/target handles. Individual nodes render their body content
 * as children.
 */

import React from 'react';
import { Handle, Position, useNodeId } from '@xyflow/react';
import {
  Play, Sparkles, GitBranch, BookOpen, MessageSquare, Wand2, Globe, Plug,
  Filter, Code2, Mail,
  CheckCircle2, AlertCircle, Loader2, Circle, X,
} from 'lucide-react';
import type { NodeType, NodeStatus } from '@/lib/workflow/types';
import { getNodeDef } from '@/lib/workflow/registry';
import { useWorkflowStore } from '@/lib/workflow/store';

// Map string icon names to components
const ICON_MAP: Record<string, React.ElementType> = {
  Play, Sparkles, GitBranch, BookOpen, MessageSquare, Wand2, Globe, Plug,
  Filter, Code2, Mail,
};

interface BaseNodeProps {
  nodeType: NodeType;
  label: string;
  status?: NodeStatus;
  selected?: boolean;
  children?: React.ReactNode;
  /** Override the default source/target handle rendering. */
  customHandles?: React.ReactNode;
  executionOutput?: string;
  executionError?: string;
}

function StatusIcon({ status }: { status: NodeStatus }) {
  switch (status) {
    case 'running':
      return <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />;
    case 'success':
      return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
    case 'error':
      return <AlertCircle className="w-3.5 h-3.5 text-red-400" />;
    default:
      return <Circle className="w-3.5 h-3.5 text-gray-600" />;
  }
}

export function BaseNode({
  nodeType,
  label,
  status = 'idle',
  selected = false,
  children,
  customHandles,
  executionError,
}: BaseNodeProps) {
  const def = getNodeDef(nodeType);
  const IconComponent = ICON_MAP[def.iconName] ?? Circle;
  const nodeId = useNodeId();
  const removeNode = useWorkflowStore((s) => s.removeNode);

  return (
    <div
      className={`
        group relative bg-gray-900 rounded-xl border-2 min-w-[220px] max-w-[280px]
        shadow-xl transition-all duration-150
        ${selected ? `${def.borderColor} shadow-lg` : 'border-gray-700'}
        ${status === 'running' ? 'ring-2 ring-blue-500/50' : ''}
        ${status === 'success' ? 'ring-1 ring-emerald-500/30' : ''}
        ${status === 'error' ? 'ring-2 ring-red-500/50' : ''}
      `}
    >
      {/* Delete — appears on hover (also: select the node and press Delete) */}
      {nodeId && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            removeNode(nodeId);
          }}
          className="nodrag nopan absolute -top-2.5 -right-2.5 z-10 p-1 rounded-full bg-gray-800 border border-gray-700 text-gray-400 shadow opacity-0 transition-all hover:text-red-400 hover:border-red-500/60 focus:opacity-100 group-hover:opacity-100"
          title="Delete node (or select it and press Delete)"
          aria-label="Delete node"
        >
          <X className="w-3 h-3" />
        </button>
      )}

      {/* Header */}
      <div className={`${def.color} rounded-t-[10px] px-3 py-2 flex items-center gap-2`}>
        <IconComponent className="w-4 h-4 text-white shrink-0" />
        <span className="text-white text-xs font-semibold truncate flex-1">{label}</span>
        <StatusIcon status={status} />
      </div>

      {/* Body */}
      {children && (
        <div className="px-3 py-2.5 text-xs text-gray-400 space-y-1">
          {children}
        </div>
      )}

      {/* Error message */}
      {status === 'error' && executionError && (
        <div className="px-3 pb-2 text-xs text-red-400 truncate">
          {executionError}
        </div>
      )}

      {/* Handles */}
      {customHandles ?? (
        <>
          {def.hasTargetHandle && (
            <Handle
              type="target"
              position={Position.Left}
              className="!w-3 !h-3 !bg-gray-600 !border-2 !border-gray-400 hover:!bg-gray-300 transition-colors"
            />
          )}
          {def.hasSourceHandle && (
            <Handle
              type="source"
              position={Position.Right}
              className="!w-3 !h-3 !bg-gray-600 !border-2 !border-gray-400 hover:!bg-gray-300 transition-colors"
            />
          )}
        </>
      )}
    </div>
  );
}
