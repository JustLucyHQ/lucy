'use client';

/**
 * WorkflowCanvas — the main React Flow drag-and-drop canvas.
 *
 * - Registers all custom node types
 * - Handles drag-from-sidebar drops via onDrop/onDragOver
 * - Wires React Flow callbacks to the Zustand store
 * - Dark theme with background grid, minimap, and controls
 */

import React, { useCallback, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import type { Node, NodeTypes } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useWorkflowStore } from '@/lib/workflow/store';
import type { NodeType, WorkflowNode, WorkflowNodeData } from '@/lib/workflow/types';

import { StartNode } from './nodes/StartNode';
import { LLMNode } from './nodes/LLMNode';
import { ConditionNode } from './nodes/ConditionNode';
import { KnowledgeBaseNode } from './nodes/KnowledgeBaseNode';
import { OutputNode } from './nodes/OutputNode';
import { TransformNode } from './nodes/TransformNode';
import { HttpNode } from './nodes/HttpNode';
import { IntegrationNode } from './nodes/IntegrationNode';
import { FilterNode } from './nodes/FilterNode';
import { CodeNode } from './nodes/CodeNode';
import { SendEmailNode } from './nodes/SendEmailNode';

// ─── Custom node type registry ─────────────────────────────────────────────

// Must be stable (defined outside render) — cast to NodeTypes to satisfy React Flow
const NODE_TYPES: NodeTypes = {
  start: StartNode as NodeTypes[string],
  llm: LLMNode as NodeTypes[string],
  condition: ConditionNode as NodeTypes[string],
  knowledgeBase: KnowledgeBaseNode as NodeTypes[string],
  output: OutputNode as NodeTypes[string],
  transform: TransformNode as NodeTypes[string],
  http: HttpNode as NodeTypes[string],
  filter: FilterNode as NodeTypes[string],
  code: CodeNode as NodeTypes[string],
  sendEmail: SendEmailNode as NodeTypes[string],
  integration: IntegrationNode as NodeTypes[string],
};

// ─── Inner canvas (needs useReactFlow) ────────────────────────────────────

function CanvasInner() {
  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);
  const onNodesChange = useWorkflowStore((s) => s.onNodesChange);
  const onEdgesChange = useWorkflowStore((s) => s.onEdgesChange);
  const onConnect = useWorkflowStore((s) => s.onConnect);
  const addNode = useWorkflowStore((s) => s.addNode);
  const setSelectedNode = useWorkflowStore((s) => s.setSelectedNode);

  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const nodeType = event.dataTransfer.getData('application/lucy-workflow-node') as NodeType;
      if (!nodeType) return;

      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      addNode(nodeType, position);
    },
    [addNode, screenToFlowPosition]
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setSelectedNode(node.id);
    },
    [setSelectedNode]
  );

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, [setSelectedNode]);

  return (
    <div ref={reactFlowWrapper} className="flex-1 h-full" aria-label="Workflow canvas" role="application">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={NODE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.3, maxZoom: 1.2 }}
        deleteKeyCode="Delete"
        multiSelectionKeyCode="Shift"
        colorMode="dark"
        style={{ backgroundColor: '#030712' }}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#1f2937"
        />
        <Controls
          className="!bg-gray-800 !border-gray-700 !rounded-lg overflow-hidden"
          showInteractive={false}
        />
        <MiniMap
          className="!bg-gray-900 !border !border-gray-700 !rounded-lg"
          nodeColor={(node) => {
            const colorMap: Record<string, string> = {
              start: '#059669',
              llm: '#9333ea',
              condition: '#3b82f6',
              knowledgeBase: '#d97706',
              output: '#059669',
              transform: '#ca8a04',
              http: '#ea580c',
              integration: '#2563eb',
            };
            const wfNode = node as WorkflowNode;
            return colorMap[wfNode.data?.nodeType as string] ?? '#374151';
          }}
          maskColor="rgba(0,0,0,0.7)"
        />
      </ReactFlow>
    </div>
  );
}

// ─── Public component (wraps with ReactFlowProvider) ──────────────────────

export function WorkflowCanvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}
