/**
 * Zustand store for the workflow editor.
 *
 * Manages canvas state (nodes/edges), selection, execution state, and logs.
 * Uses Immer-style mutation via Zustand's setter.
 */

'use client';

import { create } from 'zustand';
import type {
  WorkflowNode,
  WorkflowEdge,
  WorkflowStatus,
  NodeStatus,
  ExecutionLogEntry,
  NodeConfig,
  NodeType,
} from './types';
import { NODE_CONFIG_DEFAULTS } from './types';
import { getNodeDef } from './registry';
import { applyNodeChanges, applyEdgeChanges } from '@xyflow/react';
import type { NodeChange, EdgeChange, Connection } from '@xyflow/react';

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

interface WorkflowState {
  // ── Workflow metadata
  workflowId: string;
  workflowName: string;
  workflowDescription: string;

  // ── Canvas
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];

  // ── Selection
  selectedNodeId: string | null;

  // ── Execution
  executionStatus: WorkflowStatus;
  executionLogs: ExecutionLogEntry[];
  finalOutput: string | null;
  executionError: string | null;
  /** Retry attempt info for a durable (server) run, surfaced while queued/running. */
  executionAttempt: { attempt: number; max: number } | null;

  // ── Actions — workflow metadata
  setWorkflowId: (id: string) => void;
  setWorkflowName: (name: string) => void;
  setWorkflowDescription: (desc: string) => void;
  loadWorkflow: (id: string, name: string, description: string, nodes: WorkflowNode[], edges: WorkflowEdge[]) => void;

  // ── Actions — canvas
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  addNode: (type: NodeType, position: { x: number; y: number }) => WorkflowNode;
  removeNode: (id: string) => void;
  updateNodeConfig: (id: string, config: Partial<NodeConfig>) => void;
  updateNodeStatus: (id: string, status: NodeStatus, output?: string, error?: string) => void;
  resetNodeStatuses: () => void;

  // ── Actions — selection
  setSelectedNode: (id: string | null) => void;

  // ── Actions — execution
  setExecutionStatus: (status: WorkflowStatus) => void;
  appendLog: (entry: ExecutionLogEntry) => void;
  setFinalOutput: (output: string | null) => void;
  setExecutionError: (error: string | null) => void;
  setExecutionAttempt: (a: { attempt: number; max: number } | null) => void;
  resetExecution: () => void;
}

export const useWorkflowStore = create<WorkflowState>()((set, get) => ({
  // ── Initial state
  workflowId: '',
  workflowName: 'Untitled Workflow',
  workflowDescription: '',
  nodes: [],
  edges: [],
  selectedNodeId: null,
  executionStatus: 'idle',
  executionLogs: [],
  finalOutput: null,
  executionError: null,
  executionAttempt: null,

  // ── Metadata actions
  setWorkflowId: (id) => set({ workflowId: id }),
  setWorkflowName: (name) => set({ workflowName: name }),
  setWorkflowDescription: (desc) => set({ workflowDescription: desc }),
  loadWorkflow: (id, name, description, nodes, edges) =>
    set({ workflowId: id, workflowName: name, workflowDescription: description, nodes, edges }),

  // ── Canvas actions
  onNodesChange: (changes) =>
    set((state) => ({
      nodes: applyNodeChanges(changes, state.nodes) as WorkflowNode[],
    })),

  onEdgesChange: (changes) =>
    set((state) => ({
      edges: applyEdgeChanges(changes, state.edges),
    })),

  onConnect: (connection) =>
    set((state) => {
      const newEdge: WorkflowEdge = {
        id: `edge_${generateId()}`,
        source: connection.source,
        target: connection.target,
        sourceHandle: connection.sourceHandle ?? null,
        targetHandle: connection.targetHandle ?? null,
        type: 'smoothstep',
        animated: false,
        style: { stroke: '#6b7280', strokeWidth: 2 },
      };
      // Prevent duplicate edges
      const exists = state.edges.some(
        (e) =>
          e.source === connection.source &&
          e.target === connection.target &&
          e.sourceHandle === connection.sourceHandle
      );
      if (exists) return state;
      return { edges: [...state.edges, newEdge] };
    }),

  addNode: (type, position) => {
    const def = getNodeDef(type);
    const id = `node_${generateId()}`;
    const newNode: WorkflowNode = {
      id,
      type,
      position,
      data: {
        nodeType: type,
        label: def.label,
        config: { ...NODE_CONFIG_DEFAULTS[type] },
        status: 'idle',
      },
    };
    set((state) => ({ nodes: [...state.nodes, newNode] }));
    return newNode;
  },

  removeNode: (id) =>
    set((state) => ({
      nodes: state.nodes.filter((n) => n.id !== id),
      edges: state.edges.filter((e) => e.source !== id && e.target !== id),
      selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
    })),

  updateNodeConfig: (id, config) =>
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === id
          ? { ...n, data: { ...n.data, config: { ...n.data.config, ...config } } }
          : n
      ),
    })),

  updateNodeStatus: (id, status, output, error) =>
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === id
          ? {
              ...n,
              data: {
                ...n.data,
                status,
                executionOutput: output,
                executionError: error,
              },
            }
          : n
      ),
    })),

  resetNodeStatuses: () =>
    set((state) => ({
      nodes: state.nodes.map((n) => ({
        ...n,
        data: { ...n.data, status: 'idle', executionOutput: undefined, executionError: undefined },
      })),
    })),

  // ── Selection
  setSelectedNode: (id) => set({ selectedNodeId: id }),

  // ── Execution
  setExecutionStatus: (status) => set({ executionStatus: status }),
  appendLog: (entry) =>
    set((state) => ({ executionLogs: [...state.executionLogs, entry] })),
  setFinalOutput: (output) => set({ finalOutput: output }),
  setExecutionError: (error) => set({ executionError: error }),
  setExecutionAttempt: (a) => set({ executionAttempt: a }),
  resetExecution: () =>
    set({
      executionStatus: 'idle',
      executionLogs: [],
      finalOutput: null,
      executionError: null,
      executionAttempt: null,
    }),
}));
