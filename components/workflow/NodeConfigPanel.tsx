'use client';

/**
 * NodeConfigPanel — right sidebar.
 * Renders a dynamic configuration form based on the selected node type.
 */

import React, { useEffect, useState } from 'react';
import { X, Trash2 } from 'lucide-react';
import { useWorkflowStore } from '@/lib/workflow/store';
import { getModelsByProvider } from '@/lib/providers';
import type {
  NodeType,
  StartNodeConfig,
  LLMNodeConfig,
  ConditionNodeConfig,
  KnowledgeBaseNodeConfig,
  OutputNodeConfig,
  TransformNodeConfig,
  HttpNodeConfig,
  IntegrationNodeConfig,
  FilterNodeConfig,
  CodeNodeConfig,
  SendEmailNodeConfig,
} from '@/lib/workflow/types';
import { getAllProjects } from '@/lib/integrations/registry';
import { registerContractorsRoom } from '@/lib/integrations/contractors-room';
import type { ProjectIntegration } from '@/lib/integrations/registry';

// Ensure built-in integrations are registered when config panel loads
registerContractorsRoom();

// ─── Shared form primitives ────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-gray-400">{label}</label>
      {children}
    </div>
  );
}

const inputCls =
  'w-full bg-gray-800 border border-gray-700 rounded-md px-2.5 py-1.5 text-xs text-gray-100 placeholder-gray-600 focus:outline-none focus:border-lucy-500 focus:ring-1 focus:ring-lucy-500';

const selectCls = `${inputCls} cursor-pointer`;

function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      className={inputCls}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  );
}

function TextArea({
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      className={`${inputCls} resize-none`}
      rows={rows}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  );
}

function SelectInput({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <select className={selectCls} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// ─── Per-node config forms ─────────────────────────────────────────────────

function StartConfig({ nodeId, config }: { nodeId: string; config: StartNodeConfig }) {
  const updateNodeConfig = useWorkflowStore((s) => s.updateNodeConfig);
  const vars = config.inputVariables ?? [];

  const updateVar = (index: number, key: keyof (typeof vars)[0], value: string) => {
    const next = vars.map((v, i) => (i === index ? { ...v, [key]: value } : v));
    updateNodeConfig(nodeId, { inputVariables: next } as Partial<StartNodeConfig>);
  };

  const addVar = () => {
    updateNodeConfig(nodeId, {
      inputVariables: [...vars, { name: `var_${vars.length + 1}`, description: '', defaultValue: '' }],
    } as Partial<StartNodeConfig>);
  };

  const removeVar = (index: number) => {
    updateNodeConfig(nodeId, {
      inputVariables: vars.filter((_, i) => i !== index),
    } as Partial<StartNodeConfig>);
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {vars.map((v, i) => (
          <div key={i} className="bg-gray-800/50 rounded-lg p-2.5 space-y-2 border border-gray-700">
            <div className="flex items-center gap-2">
              <TextInput
                value={v.name}
                onChange={(val) => updateVar(i, 'name', val)}
                placeholder="variable_name"
              />
              <button
                onClick={() => removeVar(i)}
                className="text-gray-600 hover:text-red-400 transition-colors p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <TextInput
              value={v.defaultValue}
              onChange={(val) => updateVar(i, 'defaultValue', val)}
              placeholder="Default value"
            />
          </div>
        ))}
      </div>
      <button
        onClick={addVar}
        className="w-full py-1.5 text-xs text-lucy-400 border border-dashed border-lucy-700 rounded-md hover:bg-lucy-900/20 transition-colors"
      >
        + Add Variable
      </button>
    </div>
  );
}

function LLMConfig({ nodeId, config }: { nodeId: string; config: LLMNodeConfig }) {
  const updateNodeConfig = useWorkflowStore((s) => s.updateNodeConfig);
  const u = (patch: Partial<LLMNodeConfig>) => updateNodeConfig(nodeId, patch);
  const modelsByProvider = getModelsByProvider();

  const providerOptions = [
    { value: 'openai', label: 'OpenAI' },
    { value: 'anthropic', label: 'Anthropic' },
    { value: 'google', label: 'Google' },
  ];

  const modelsForProvider = modelsByProvider[config.provider] ?? [];
  const modelOptions = modelsForProvider.map((m) => ({ value: m.id, label: m.name }));

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-purple-400 uppercase tracking-wide">AI Agent</p>
      <Field label="Provider">
        <SelectInput
          value={config.provider}
          onChange={(v) => {
            const provider = v as LLMNodeConfig['provider'];
            const firstModel = (modelsByProvider[provider] ?? [])[0];
            u({ provider, model: firstModel?.id ?? '' });
          }}
          options={providerOptions}
        />
      </Field>
      <Field label="Model">
        <SelectInput
          value={config.model}
          onChange={(v) => u({ model: v })}
          options={modelOptions}
        />
      </Field>
      <Field label="System Prompt">
        <TextArea
          value={config.systemPrompt}
          onChange={(v) => u({ systemPrompt: v })}
          placeholder="You are a helpful assistant."
          rows={4}
        />
      </Field>
      <Field label={`Temperature: ${config.temperature}`}>
        <input
          type="range"
          min="0"
          max="2"
          step="0.1"
          value={config.temperature}
          onChange={(e) => u({ temperature: parseFloat(e.target.value) })}
          className="w-full accent-lucy-500"
        />
      </Field>
      <Field label="Max Tokens">
        <TextInput
          value={String(config.maxTokens)}
          onChange={(v) => u({ maxTokens: parseInt(v, 10) || 1024 })}
          placeholder="1024"
        />
      </Field>
      <Field label="Input Variable">
        <TextInput
          value={config.inputVariable ?? ''}
          onChange={(v) => u({ inputVariable: v })}
          placeholder="user_query"
        />
      </Field>
    </div>
  );
}

function ConditionConfig({ nodeId, config }: { nodeId: string; config: ConditionNodeConfig }) {
  const updateNodeConfig = useWorkflowStore((s) => s.updateNodeConfig);
  const u = (patch: Partial<ConditionNodeConfig>) => updateNodeConfig(nodeId, patch);

  const operatorOptions: Array<{ value: ConditionNodeConfig['operator']; label: string }> = [
    { value: 'contains', label: 'Contains' },
    { value: 'not_contains', label: "Doesn't contain" },
    { value: 'equals', label: 'Equals' },
    { value: 'not_equals', label: 'Not equals' },
    { value: 'starts_with', label: 'Starts with' },
    { value: 'ends_with', label: 'Ends with' },
    { value: 'greater_than', label: 'Greater than (numeric)' },
    { value: 'less_than', label: 'Less than (numeric)' },
    { value: 'regex', label: 'Matches regex' },
  ];

  return (
    <div className="space-y-3">
      <Field label="Field to Check">
        <TextInput
          value={config.field}
          onChange={(v) => u({ field: v })}
          placeholder="output"
        />
      </Field>
      <Field label="Operator">
        <SelectInput
          value={config.operator}
          onChange={(v) => u({ operator: v as ConditionNodeConfig['operator'] })}
          options={operatorOptions}
        />
      </Field>
      <Field label="Value">
        <TextInput
          value={config.value}
          onChange={(v) => u({ value: v })}
          placeholder="error"
        />
      </Field>
    </div>
  );
}

function KBConfig({ nodeId, config }: { nodeId: string; config: KnowledgeBaseNodeConfig }) {
  const updateNodeConfig = useWorkflowStore((s) => s.updateNodeConfig);
  const u = (patch: Partial<KnowledgeBaseNodeConfig>) => updateNodeConfig(nodeId, patch);

  return (
    <div className="space-y-3">
      <Field label="Collection Name">
        <TextInput
          value={config.collectionName}
          onChange={(v) => u({ collectionName: v })}
          placeholder="my-docs"
        />
      </Field>
      <Field label="Query (supports {{variables}})">
        <TextInput
          value={config.query}
          onChange={(v) => u({ query: v })}
          placeholder="{{user_query}}"
        />
      </Field>
      <Field label="Top K Results">
        <TextInput
          value={String(config.topK)}
          onChange={(v) => u({ topK: parseInt(v, 10) || 5 })}
          placeholder="5"
        />
      </Field>
      <p className="text-xs text-amber-500 bg-amber-900/20 border border-amber-800 rounded-md p-2">
        Placeholder — connect a real vector store for production use.
      </p>
    </div>
  );
}

function OutputConfig({ nodeId, config }: { nodeId: string; config: OutputNodeConfig }) {
  const updateNodeConfig = useWorkflowStore((s) => s.updateNodeConfig);
  const u = (patch: Partial<OutputNodeConfig>) => updateNodeConfig(nodeId, patch);

  return (
    <div className="space-y-3">
      <Field label="Display Name">
        <TextInput
          value={config.displayName}
          onChange={(v) => u({ displayName: v })}
          placeholder="Result"
        />
      </Field>
      <Field label="Format">
        <SelectInput
          value={config.format}
          onChange={(v) => u({ format: v as OutputNodeConfig['format'] })}
          options={[
            { value: 'text', label: 'Plain text' },
            { value: 'markdown', label: 'Markdown' },
            { value: 'json', label: 'JSON' },
          ]}
        />
      </Field>
    </div>
  );
}

function TransformConfig({ nodeId, config }: { nodeId: string; config: TransformNodeConfig }) {
  const updateNodeConfig = useWorkflowStore((s) => s.updateNodeConfig);
  const u = (patch: Partial<TransformNodeConfig>) => updateNodeConfig(nodeId, patch);

  const opOptions: Array<{ value: TransformNodeConfig['operation']; label: string }> = [
    { value: 'template', label: 'Template' },
    { value: 'uppercase', label: 'Uppercase' },
    { value: 'lowercase', label: 'Lowercase' },
    { value: 'trim', label: 'Trim whitespace' },
    { value: 'extract_json', label: 'Extract JSON field' },
    { value: 'combine', label: 'Combine all inputs' },
    { value: 'replace', label: 'Find & replace' },
  ];

  return (
    <div className="space-y-3">
      <Field label="Operation">
        <SelectInput
          value={config.operation}
          onChange={(v) => u({ operation: v as TransformNodeConfig['operation'] })}
          options={opOptions}
        />
      </Field>
      {config.operation === 'template' && (
        <Field label="Template (use {{input}} or {{varName}})">
          <TextArea
            value={config.template ?? ''}
            onChange={(v) => u({ template: v })}
            placeholder="{{input}}"
          />
        </Field>
      )}
      {config.operation === 'replace' && (
        <>
          <Field label="Find">
            <TextInput
              value={config.searchValue ?? ''}
              onChange={(v) => u({ searchValue: v })}
              placeholder="find this"
            />
          </Field>
          <Field label="Replace With">
            <TextInput
              value={config.replaceValue ?? ''}
              onChange={(v) => u({ replaceValue: v })}
              placeholder="replace with"
            />
          </Field>
        </>
      )}
      {config.operation === 'extract_json' && (
        <Field label="JSON Path (e.g. data.result)">
          <TextInput
            value={config.jsonPath ?? ''}
            onChange={(v) => u({ jsonPath: v })}
            placeholder="data.result"
          />
        </Field>
      )}
    </div>
  );
}

function HttpConfig({ nodeId, config }: { nodeId: string; config: HttpNodeConfig }) {
  const updateNodeConfig = useWorkflowStore((s) => s.updateNodeConfig);
  const u = (patch: Partial<HttpNodeConfig>) => updateNodeConfig(nodeId, patch);
  const headers = config.headers ?? [];

  const updateHeader = (i: number, key: 'key' | 'value', val: string) => {
    u({ headers: headers.map((h, idx) => (idx === i ? { ...h, [key]: val } : h)) });
  };

  return (
    <div className="space-y-3">
      <Field label="Method">
        <SelectInput
          value={config.method}
          onChange={(v) => u({ method: v as HttpNodeConfig['method'] })}
          options={['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => ({ value: m, label: m }))}
        />
      </Field>
      <Field label="URL (supports {{variables}})">
        <TextInput
          value={config.url}
          onChange={(v) => u({ url: v })}
          placeholder="https://api.example.com/endpoint"
        />
      </Field>
      <Field label="Headers">
        <div className="space-y-1.5">
          {headers.map((h, i) => (
            <div key={i} className="flex gap-1.5">
              <input
                className={`${inputCls} w-1/2`}
                value={h.key}
                onChange={(e) => updateHeader(i, 'key', e.target.value)}
                placeholder="Key"
              />
              <input
                className={`${inputCls} w-1/2`}
                value={h.value}
                onChange={(e) => updateHeader(i, 'value', e.target.value)}
                placeholder="Value"
              />
            </div>
          ))}
          <button
            onClick={() => u({ headers: [...headers, { key: '', value: '' }] })}
            className="w-full py-1 text-xs text-gray-500 border border-dashed border-gray-700 rounded hover:border-gray-500 transition-colors"
          >
            + Add Header
          </button>
        </div>
      </Field>
      {config.method !== 'GET' && (
        <Field label="Body (JSON)">
          <TextArea
            value={config.body}
            onChange={(v) => u({ body: v })}
            placeholder='{"key": "{{value}}"}'
            rows={4}
          />
        </Field>
      )}
      <Field label="Timeout (ms)">
        <TextInput
          value={String(config.timeout)}
          onChange={(v) => u({ timeout: parseInt(v, 10) || 10000 })}
          placeholder="10000"
        />
      </Field>
    </div>
  );
}

function IntegrationConfig({
  nodeId,
  config,
}: {
  nodeId: string;
  config: IntegrationNodeConfig;
}) {
  const updateNodeConfig = useWorkflowStore((s) => s.updateNodeConfig);
  const u = (patch: Partial<IntegrationNodeConfig>) => updateNodeConfig(nodeId, patch);

  // Registry is an in-memory map populated at startup — safe to read lazily
  const [projects] = useState<ProjectIntegration[]>(() => getAllProjects());

  const selectedProject = projects.find((p) => p.id === config.projectId);
  const actions = selectedProject?.actions ?? [];
  const selectedAction = actions.find((a) => a.id === config.actionId);

  const updateMapping = (index: number, key: 'paramName' | 'varName', value: string) => {
    const next = (config.parameterMapping ?? []).map((m, i) =>
      i === index ? { ...m, [key]: value } : m
    );
    u({ parameterMapping: next });
  };

  const addMapping = () => {
    u({
      parameterMapping: [
        ...(config.parameterMapping ?? []),
        { paramName: '', varName: '' },
      ],
    });
  };

  const removeMapping = (index: number) => {
    u({
      parameterMapping: (config.parameterMapping ?? []).filter((_, i) => i !== index),
    });
  };

  return (
    <div className="space-y-3">
      <Field label="Project">
        <select
          className={selectCls}
          value={config.projectId}
          onChange={(e) => u({ projectId: e.target.value, actionId: '', parameterMapping: [] })}
        >
          <option value="">Select a project…</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>

      {config.projectId && (
        <Field label="Action">
          <select
            className={selectCls}
            value={config.actionId}
            onChange={(e) => u({ actionId: e.target.value, parameterMapping: [] })}
          >
            <option value="">Select an action…</option>
            {actions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          {selectedAction && (
            <p className="text-xs text-gray-600 mt-1">{selectedAction.description}</p>
          )}
        </Field>
      )}

      {selectedAction && (
        <Field label="Parameter Mapping">
          <div className="space-y-2">
            {(config.parameterMapping ?? []).map((mapping, i) => (
              <div key={i} className="flex items-center gap-1">
                <select
                  className={`${selectCls} flex-1`}
                  value={mapping.paramName}
                  onChange={(e) => updateMapping(i, 'paramName', e.target.value)}
                >
                  <option value="">Param…</option>
                  {selectedAction.parameters.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name}{p.required ? ' *' : ''}
                    </option>
                  ))}
                </select>
                <span className="text-gray-600 text-xs">←</span>
                <input
                  className={`${inputCls} flex-1`}
                  value={mapping.varName}
                  onChange={(e) => updateMapping(i, 'varName', e.target.value)}
                  placeholder="{{var}} or value"
                />
                <button
                  onClick={() => removeMapping(i)}
                  className="text-gray-600 hover:text-red-400 transition-colors p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={addMapping}
            className="w-full mt-2 py-1.5 text-xs text-lucy-400 border border-dashed border-lucy-700 rounded-md hover:bg-lucy-900/20 transition-colors"
          >
            + Add Parameter Mapping
          </button>
          {selectedAction.parameters.some((p) => p.required) && (
            <p className="text-xs text-amber-500 mt-1">* = required parameter</p>
          )}
        </Field>
      )}
    </div>
  );
}

function FilterConfig({ nodeId, config }: { nodeId: string; config: FilterNodeConfig }) {
  const updateNodeConfig = useWorkflowStore((s) => s.updateNodeConfig);
  const u = (patch: Partial<FilterNodeConfig>) => updateNodeConfig(nodeId, patch);
  const operatorOptions: Array<{ value: FilterNodeConfig['operator']; label: string }> = [
    { value: 'is_not_empty', label: 'Is not empty' },
    { value: 'is_empty', label: 'Is empty' },
    { value: 'contains', label: 'Contains' },
    { value: 'not_contains', label: "Doesn't contain" },
    { value: 'equals', label: 'Equals' },
    { value: 'not_equals', label: 'Not equals' },
    { value: 'starts_with', label: 'Starts with' },
    { value: 'ends_with', label: 'Ends with' },
    { value: 'greater_than', label: 'Greater than (numeric)' },
    { value: 'less_than', label: 'Less than (numeric)' },
    { value: 'regex', label: 'Matches regex' },
  ];
  const needsValue = config.operator !== 'is_empty' && config.operator !== 'is_not_empty';
  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">Continue only if the input matches; otherwise this branch stops.</p>
      <Field label="Operator">
        <SelectInput value={config.operator} onChange={(v) => u({ operator: v as FilterNodeConfig['operator'] })} options={operatorOptions} />
      </Field>
      {needsValue && (
        <Field label="Value">
          <TextInput value={config.value} onChange={(v) => u({ value: v })} placeholder="value" />
        </Field>
      )}
    </div>
  );
}

function CodeConfig({ nodeId, config }: { nodeId: string; config: CodeNodeConfig }) {
  const updateNodeConfig = useWorkflowStore((s) => s.updateNodeConfig);
  return (
    <div className="space-y-3">
      <Field label="JavaScript — `input` is the incoming text; return the new value">
        <textarea
          className={`${inputCls} font-mono h-40 resize-y`}
          value={config.code}
          onChange={(e) => updateNodeConfig(nodeId, { code: e.target.value })}
          placeholder="return input.trim();"
          spellCheck={false}
        />
      </Field>
      <p className="text-xs text-gray-600">Runs synchronously. Keep it simple — no long loops.</p>
    </div>
  );
}

function SendEmailConfig({ nodeId, config }: { nodeId: string; config: SendEmailNodeConfig }) {
  const updateNodeConfig = useWorkflowStore((s) => s.updateNodeConfig);
  const u = (patch: Partial<SendEmailNodeConfig>) => updateNodeConfig(nodeId, patch);
  return (
    <div className="space-y-3">
      <Field label="To">
        <TextInput value={config.to} onChange={(v) => u({ to: v })} placeholder="someone@example.com or {{var}}" />
      </Field>
      <Field label="Subject">
        <TextInput value={config.subject} onChange={(v) => u({ subject: v })} placeholder="Workflow result" />
      </Field>
      <Field label="Body">
        <textarea
          className={`${inputCls} h-28 resize-y`}
          value={config.body}
          onChange={(e) => u({ body: e.target.value })}
          placeholder="{{input}}"
        />
      </Field>
      <p className="text-xs text-gray-600">Uses your SMTP settings. Only runs server-side (connected mode).</p>
    </div>
  );
}

// ─── Main panel ────────────────────────────────────────────────────────────

export function NodeConfigPanel() {
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId);
  const nodes = useWorkflowStore((s) => s.nodes);
  const removeNode = useWorkflowStore((s) => s.removeNode);
  const updateNodeConfig = useWorkflowStore((s) => s.updateNodeConfig);

  if (!selectedNodeId) {
    return (
      <aside className="w-64 bg-gray-900 border-l border-gray-800 flex flex-col items-center justify-center">
        <div className="text-center px-4">
          <p className="text-gray-600 text-sm">Select a node to configure it</p>
        </div>
      </aside>
    );
  }

  const node = nodes.find((n) => n.id === selectedNodeId);
  if (!node) return null;

  const { nodeType, config, label } = node.data;

  const renderForm = () => {
    switch (nodeType as NodeType) {
      case 'start':    return <StartConfig nodeId={selectedNodeId} config={config as StartNodeConfig} />;
      case 'llm':      return <LLMConfig nodeId={selectedNodeId} config={config as LLMNodeConfig} />;
      case 'condition': return <ConditionConfig nodeId={selectedNodeId} config={config as ConditionNodeConfig} />;
      case 'knowledgeBase': return <KBConfig nodeId={selectedNodeId} config={config as KnowledgeBaseNodeConfig} />;
      case 'output':   return <OutputConfig nodeId={selectedNodeId} config={config as OutputNodeConfig} />;
      case 'transform': return <TransformConfig nodeId={selectedNodeId} config={config as TransformNodeConfig} />;
      case 'http':     return <HttpConfig nodeId={selectedNodeId} config={config as HttpNodeConfig} />;
      case 'filter':   return <FilterConfig nodeId={selectedNodeId} config={config as FilterNodeConfig} />;
      case 'code':     return <CodeConfig nodeId={selectedNodeId} config={config as CodeNodeConfig} />;
      case 'sendEmail': return <SendEmailConfig nodeId={selectedNodeId} config={config as SendEmailNodeConfig} />;
      case 'integration': return <IntegrationConfig nodeId={selectedNodeId} config={config as IntegrationNodeConfig} />;
      default:         return null;
    }
  };

  return (
    <aside className="w-64 bg-gray-900 border-l border-gray-800 flex flex-col overflow-y-auto">
      {/* Header */}
      <div className="px-3 py-3 border-b border-gray-800 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-xs font-semibold text-gray-300 truncate">{label}</h2>
          <p className="text-xs text-gray-600 capitalize">{nodeType}</p>
        </div>
        <button
          onClick={() => removeNode(selectedNodeId)}
          className="p-1 text-gray-600 hover:text-red-400 transition-colors rounded shrink-0"
          title="Delete node (Del)"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Label field */}
      <div className="px-3 pt-3 pb-1">
        <Field label="Label">
          <input
            className={inputCls}
            value={label}
            onChange={(e) =>
              updateNodeConfig(selectedNodeId, { label: e.target.value } as Partial<typeof config>)
            }
            placeholder="Node label"
          />
        </Field>
      </div>

      {/* Node-specific form */}
      <div className="px-3 pb-4 pt-2">
        {renderForm()}
      </div>
    </aside>
  );
}
