/**
 * Workflow type definitions.
 *
 * These types model the workflow graph — nodes, edges, execution state,
 * and per-node configuration. All node configs extend NodeConfigBase.
 */

import type { Node, Edge } from '@xyflow/react';

// ─── Node type identifiers ─────────────────────────────────────────────────

export type NodeType =
  | 'start'
  | 'llm'
  | 'condition'
  | 'filter'
  | 'knowledgeBase'
  | 'output'
  | 'transform'
  | 'code'
  | 'http'
  | 'sendEmail'
  | 'integration';

// ─── Execution status ──────────────────────────────────────────────────────

export type NodeStatus = 'idle' | 'running' | 'success' | 'error';
export type WorkflowStatus = 'idle' | 'queued' | 'running' | 'completed' | 'error' | 'canceled';

// ─── Node configuration types ──────────────────────────────────────────────

export interface NodeConfigBase {
  label?: string;
}

export interface StartNodeConfig extends NodeConfigBase {
  inputVariables: Array<{ name: string; description: string; defaultValue: string }>;
}

export interface LLMNodeConfig extends NodeConfigBase {
  provider: 'openai' | 'anthropic' | 'google';
  model: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  inputVariable?: string;
}

export interface ConditionNodeConfig extends NodeConfigBase {
  field: string;
  operator: 'contains' | 'not_contains' | 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'regex' | 'starts_with' | 'ends_with';
  value: string;
}

export interface KnowledgeBaseNodeConfig extends NodeConfigBase {
  collectionName: string;
  query: string;
  topK: number;
}

export interface OutputNodeConfig extends NodeConfigBase {
  displayName: string;
  format: 'text' | 'markdown' | 'json';
}

export interface TransformNodeConfig extends NodeConfigBase {
  operation: 'template' | 'uppercase' | 'lowercase' | 'trim' | 'extract_json' | 'combine' | 'replace';
  template?: string;
  searchValue?: string;
  replaceValue?: string;
  jsonPath?: string;
}

export interface HttpNodeConfig extends NodeConfigBase {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers: Array<{ key: string; value: string }>;
  body: string;
  timeout: number;
}

/**
 * IntegrationNodeConfig — executes an action on a registered Lucy integration.
 * The `parameterMapping` field maps action parameter names to workflow
 * variable names or literal values (prefix with `$` for variables).
 */
export interface IntegrationNodeConfig extends NodeConfigBase {
  projectId: string;        // e.g. 'contractors-room'
  actionId: string;         // e.g. 'create-project'
  /** Map: actionParamName → workflowVarName or literal value. */
  parameterMapping: Array<{ paramName: string; varName: string }>;
}

/** Filter — passes the input through only if the predicate holds; otherwise halts the branch. */
export interface FilterNodeConfig extends NodeConfigBase {
  operator: 'contains' | 'not_contains' | 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'regex' | 'starts_with' | 'ends_with' | 'is_empty' | 'is_not_empty';
  value: string;
}

/** Code — runs a JS snippet `(input) => …`; the returned value becomes the node output. */
export interface CodeNodeConfig extends NodeConfigBase {
  code: string;
}

/** Send Email — sends an email (server/connected mode only). Fields are interpolated. */
export interface SendEmailNodeConfig extends NodeConfigBase {
  to: string;
  subject: string;
  body: string;
}

export type NodeConfig =
  | StartNodeConfig
  | LLMNodeConfig
  | ConditionNodeConfig
  | FilterNodeConfig
  | KnowledgeBaseNodeConfig
  | OutputNodeConfig
  | TransformNodeConfig
  | CodeNodeConfig
  | HttpNodeConfig
  | SendEmailNodeConfig
  | IntegrationNodeConfig;

// ─── Workflow node / edge (extends React Flow types) ──────────────────────

export interface WorkflowNodeData extends Record<string, unknown> {
  nodeType: NodeType;
  label: string;
  config: NodeConfig;
  status?: NodeStatus;
  executionOutput?: string;
  executionError?: string;
  executionDuration?: number;
}

export type WorkflowNode = Node<WorkflowNodeData>;
export type WorkflowEdge = Edge;

// ─── Workflow definition ───────────────────────────────────────────────────

export interface Workflow {
  id: string;
  name: string;
  description: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  isPublished: boolean;
  createdAt: number;
  updatedAt: number;
}

// ─── Execution log ─────────────────────────────────────────────────────────

export interface ExecutionLogEntry {
  nodeId: string;
  nodeLabel: string;
  nodeType: NodeType;
  status: NodeStatus;
  startedAt: number;
  completedAt?: number;
  duration?: number;
  input?: string;
  output?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface ExecutionResult {
  status: WorkflowStatus;
  logs: ExecutionLogEntry[];
  finalOutput?: string;
  error?: string;
  totalDuration: number;
}

// ─── Config defaults (used by registry) ───────────────────────────────────

export const NODE_CONFIG_DEFAULTS: Record<NodeType, NodeConfig> = {
  integration: {
    label: 'Integration Action',
    projectId: '',
    actionId: '',
    parameterMapping: [],
  } satisfies IntegrationNodeConfig,
  start: {
    label: 'Start',
    inputVariables: [{ name: 'user_query', description: 'User input', defaultValue: '' }],
  } satisfies StartNodeConfig,
  llm: {
    label: 'AI Agent',
    provider: 'openai',
    model: 'gpt-4o',
    systemPrompt: 'You are a helpful assistant.',
    temperature: 0.7,
    maxTokens: 1024,
    inputVariable: 'user_query',
  } satisfies LLMNodeConfig,
  condition: {
    label: 'Condition',
    field: 'output',
    operator: 'contains',
    value: '',
  } satisfies ConditionNodeConfig,
  knowledgeBase: {
    label: 'Knowledge Base',
    collectionName: '',
    query: '{{user_query}}',
    topK: 5,
  } satisfies KnowledgeBaseNodeConfig,
  output: {
    label: 'Output',
    displayName: 'Result',
    format: 'markdown',
  } satisfies OutputNodeConfig,
  transform: {
    label: 'Transform',
    operation: 'template',
    template: '{{input}}',
  } satisfies TransformNodeConfig,
  http: {
    label: 'HTTP Request',
    url: 'https://api.example.com/endpoint',
    method: 'GET',
    headers: [{ key: 'Content-Type', value: 'application/json' }],
    body: '',
    timeout: 10000,
  } satisfies HttpNodeConfig,
  filter: {
    label: 'Filter',
    operator: 'is_not_empty',
    value: '',
  } satisfies FilterNodeConfig,
  code: {
    label: 'Code',
    code: '// `input` is the incoming text. Return the new value.\nreturn input.trim();',
  } satisfies CodeNodeConfig,
  sendEmail: {
    label: 'Send Email',
    to: '',
    subject: 'Workflow result',
    body: '{{input}}',
  } satisfies SendEmailNodeConfig,
};
