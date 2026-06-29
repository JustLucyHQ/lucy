/**
 * Node type registry — metadata, defaults, and validation for each node type.
 */

import type { NodeType, NodeConfig } from './types';
import { NODE_CONFIG_DEFAULTS } from './types';

export interface NodeTypeDefinition {
  type: NodeType;
  label: string;
  description: string;
  group: 'triggers' | 'ai' | 'logic' | 'output';
  color: string;          // Tailwind bg class for header
  textColor: string;      // Tailwind text class
  borderColor: string;    // Tailwind border class
  iconName: string;       // lucide-react icon name (resolved in components)
  hasTargetHandle: boolean;
  hasSourceHandle: boolean;
  hasTrueHandle?: boolean;
  hasFalseHandle?: boolean;
  defaultConfig: NodeConfig;
}

export const NODE_TYPE_REGISTRY: Record<NodeType, NodeTypeDefinition> = {
  start: {
    type: 'start',
    label: 'Start',
    description: 'Entry point — defines input variables for the workflow',
    group: 'triggers',
    color: 'bg-emerald-600',
    textColor: 'text-emerald-400',
    borderColor: 'border-emerald-600',
    iconName: 'Play',
    hasTargetHandle: false,
    hasSourceHandle: true,
    defaultConfig: NODE_CONFIG_DEFAULTS.start,
  },
  llm: {
    type: 'llm',
    label: 'AI Agent',
    description: 'Run an AI model — pick the provider and model',
    group: 'ai',
    color: 'bg-purple-600',
    textColor: 'text-purple-400',
    borderColor: 'border-purple-600',
    iconName: 'Sparkles',
    hasTargetHandle: true,
    hasSourceHandle: true,
    defaultConfig: NODE_CONFIG_DEFAULTS.llm,
  },
  condition: {
    type: 'condition',
    label: 'Condition',
    description: 'Branch based on a condition (if/else)',
    group: 'logic',
    color: 'bg-blue-600',
    textColor: 'text-blue-400',
    borderColor: 'border-blue-600',
    iconName: 'GitBranch',
    hasTargetHandle: true,
    hasSourceHandle: false,
    hasTrueHandle: true,
    hasFalseHandle: true,
    defaultConfig: NODE_CONFIG_DEFAULTS.condition,
  },
  knowledgeBase: {
    type: 'knowledgeBase',
    label: 'Knowledge Base',
    description: 'Search documents and retrieve relevant context',
    group: 'ai',
    color: 'bg-amber-600',
    textColor: 'text-amber-400',
    borderColor: 'border-amber-600',
    iconName: 'BookOpen',
    hasTargetHandle: true,
    hasSourceHandle: true,
    defaultConfig: NODE_CONFIG_DEFAULTS.knowledgeBase,
  },
  output: {
    type: 'output',
    label: 'Output',
    description: 'Final response — displays the workflow result',
    group: 'output',
    color: 'bg-emerald-600',
    textColor: 'text-emerald-400',
    borderColor: 'border-emerald-600',
    iconName: 'MessageSquare',
    hasTargetHandle: true,
    hasSourceHandle: false,
    defaultConfig: NODE_CONFIG_DEFAULTS.output,
  },
  transform: {
    type: 'transform',
    label: 'Transform',
    description: 'Manipulate text: templates, combine, extract JSON',
    group: 'logic',
    color: 'bg-yellow-600',
    textColor: 'text-yellow-400',
    borderColor: 'border-yellow-600',
    iconName: 'Wand2',
    hasTargetHandle: true,
    hasSourceHandle: true,
    defaultConfig: NODE_CONFIG_DEFAULTS.transform,
  },
  http: {
    type: 'http',
    label: 'HTTP Request',
    description: 'Make external API calls (GET, POST, etc.)',
    group: 'output',
    color: 'bg-orange-600',
    textColor: 'text-orange-400',
    borderColor: 'border-orange-600',
    iconName: 'Globe',
    hasTargetHandle: true,
    hasSourceHandle: true,
    defaultConfig: NODE_CONFIG_DEFAULTS.http,
  },
  filter: {
    type: 'filter',
    label: 'Filter',
    description: 'Continue only if the input matches a condition',
    group: 'logic',
    color: 'bg-blue-600',
    textColor: 'text-blue-400',
    borderColor: 'border-blue-600',
    iconName: 'Filter',
    hasTargetHandle: true,
    hasSourceHandle: true,
    defaultConfig: NODE_CONFIG_DEFAULTS.filter,
  },
  code: {
    type: 'code',
    label: 'Code',
    description: 'Run a JavaScript snippet: (input) => output',
    group: 'logic',
    color: 'bg-yellow-600',
    textColor: 'text-yellow-400',
    borderColor: 'border-yellow-600',
    iconName: 'Code2',
    hasTargetHandle: true,
    hasSourceHandle: true,
    defaultConfig: NODE_CONFIG_DEFAULTS.code,
  },
  sendEmail: {
    type: 'sendEmail',
    label: 'Send Email',
    description: 'Send an email (server/connected mode only)',
    group: 'output',
    color: 'bg-red-600',
    textColor: 'text-red-400',
    borderColor: 'border-red-600',
    iconName: 'Mail',
    hasTargetHandle: true,
    hasSourceHandle: true,
    defaultConfig: NODE_CONFIG_DEFAULTS.sendEmail,
  },
  integration: {
    type: 'integration',
    label: 'Integration Action',
    description: 'Execute an action on a connected project (e.g. Contractors Room)',
    group: 'output',
    color: 'bg-blue-600',
    textColor: 'text-blue-400',
    borderColor: 'border-blue-600',
    iconName: 'Plug',
    hasTargetHandle: true,
    hasSourceHandle: true,
    defaultConfig: NODE_CONFIG_DEFAULTS.integration,
  },
};

export const NODE_GROUPS: Array<{
  id: 'triggers' | 'ai' | 'logic' | 'output';
  label: string;
}> = [
  { id: 'triggers', label: 'Triggers' },
  { id: 'ai', label: 'AI' },
  { id: 'logic', label: 'Logic' },
  { id: 'output', label: 'Output' },
];

export function getNodeDef(type: NodeType): NodeTypeDefinition {
  return NODE_TYPE_REGISTRY[type];
}

export function getAllNodeDefs(): NodeTypeDefinition[] {
  return Object.values(NODE_TYPE_REGISTRY);
}
