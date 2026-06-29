/**
 * Workflow execution engine.
 *
 * Walks the graph topologically from the Start node, executes each node
 * in order, passes outputs along edges, handles condition branching, and
 * collects per-node execution logs with timing.
 *
 * LLM nodes call the actual AI APIs via the existing lib/providers system.
 */

import type {
  Workflow,
  WorkflowNode,
  WorkflowEdge,
  ExecutionResult,
  ExecutionLogEntry,
  NodeStatus,
  StartNodeConfig,
  LLMNodeConfig,
  ConditionNodeConfig,
  TransformNodeConfig,
  HttpNodeConfig,
  OutputNodeConfig,
  KnowledgeBaseNodeConfig,
  IntegrationNodeConfig,
  FilterNodeConfig,
  CodeNodeConfig,
  SendEmailNodeConfig,
} from './types';
import { getProvider, getModelsByProvider } from '@/lib/providers';
import { executeAction } from '@/lib/integrations/actions';
import { getSupabaseClient } from '@/lib/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Thrown by the engine when a run is canceled mid-execution. */
export class WorkflowCanceledError extends Error {
  constructor(message = 'Workflow canceled') {
    super(message);
    this.name = 'WorkflowCanceledError';
  }
}

// ─── Type guard helpers ────────────────────────────────────────────────────

function asStartConfig(c: unknown): StartNodeConfig { return c as StartNodeConfig; }
function asLLMConfig(c: unknown): LLMNodeConfig { return c as LLMNodeConfig; }
function asConditionConfig(c: unknown): ConditionNodeConfig { return c as ConditionNodeConfig; }
function asTransformConfig(c: unknown): TransformNodeConfig { return c as TransformNodeConfig; }
function asHttpConfig(c: unknown): HttpNodeConfig { return c as HttpNodeConfig; }
function asOutputConfig(c: unknown): OutputNodeConfig { return c as OutputNodeConfig; }
function asKBConfig(c: unknown): KnowledgeBaseNodeConfig { return c as KnowledgeBaseNodeConfig; }
function asIntegrationConfig(c: unknown): IntegrationNodeConfig { return c as IntegrationNodeConfig; }
function asFilterConfig(c: unknown): FilterNodeConfig { return c as FilterNodeConfig; }
function asCodeConfig(c: unknown): CodeNodeConfig { return c as CodeNodeConfig; }
function asSendEmailConfig(c: unknown): SendEmailNodeConfig { return c as SendEmailNodeConfig; }

// ─── Context bag passed between nodes ─────────────────────────────────────

type ExecutionContext = Map<string, string>; // nodeId → output text

// ─── Execution callbacks ───────────────────────────────────────────────────

export interface EngineCallbacks {
  /** Called when a node starts executing. */
  onNodeStart?: (nodeId: string) => void;
  /** Called when a node finishes (success or error). */
  onNodeEnd?: (nodeId: string, status: NodeStatus, output?: string, error?: string) => void;
  /** Called with each log entry as it is emitted. */
  onLog?: (entry: ExecutionLogEntry) => void;
  /** Polled at each node; if it returns true the run is canceled (throws). */
  shouldCancel?: () => boolean | Promise<boolean>;
}

// ─── Injected dependencies (server vs browser) ─────────────────────────────
export interface EngineDeps {
  /** KB search. Browser default: fetch('/api/memory/search'). */
  searchKnowledgeBase?: (query: string, topK: number) => Promise<string>;
  /** Supabase client for integration nodes. Browser default: getSupabaseClient(). */
  supabaseClient?: SupabaseClient | null;
  /** Send an email (server only). Absent on the browser path → Send Email errors. */
  sendEmail?: (to: string, subject: string, body: string) => Promise<void>;
}

// ─── WorkflowEngine ────────────────────────────────────────────────────────

export class WorkflowEngine {
  private nodes: Map<string, WorkflowNode>;
  private edges: WorkflowEdge[];
  private logs: ExecutionLogEntry[] = [];
  private callbacks: EngineCallbacks;
  private deps: EngineDeps;

  constructor(
    workflow: Workflow,
    callbacks: EngineCallbacks = {},
    deps: EngineDeps = {}
  ) {
    this.nodes = new Map(workflow.nodes.map((n) => [n.id, n]));
    this.edges = workflow.edges;
    this.callbacks = callbacks;
    this.deps = deps;
  }

  // ── Public entry point ───────────────────────────────────────────────────

  async execute(
    inputs: Record<string, string>,
    apiKeys: Record<string, string>
  ): Promise<ExecutionResult> {
    const startedAt = Date.now();
    this.logs = [];

    const startNode = this.findStartNode();
    if (!startNode) {
      return {
        status: 'error',
        logs: [],
        error: 'No Start node found in workflow',
        totalDuration: 0,
      };
    }

    const context: ExecutionContext = new Map();

    // Seed context from workflow inputs
    const startConfig = asStartConfig(startNode.data.config);
    for (const variable of startConfig.inputVariables ?? []) {
      context.set(`var:${variable.name}`, inputs[variable.name] ?? variable.defaultValue ?? '');
    }

    try {
      const finalOutput = await this.executeNode(startNode, context, apiKeys);
      return {
        status: 'completed',
        logs: this.logs,
        finalOutput,
        totalDuration: Date.now() - startedAt,
      };
    } catch (err) {
      // Cancellation is not a failure: let it propagate so the caller
      // (server-runner) can persist `status:'canceled'` instead of `failed`.
      if (err instanceof WorkflowCanceledError) throw err;
      return {
        status: 'error',
        logs: this.logs,
        error: err instanceof Error ? err.message : String(err),
        totalDuration: Date.now() - startedAt,
      };
    }
  }

  // ── Graph traversal ──────────────────────────────────────────────────────

  private async executeNode(
    node: WorkflowNode,
    context: ExecutionContext,
    apiKeys: Record<string, string>,
    visitedIds = new Set<string>()
  ): Promise<string> {
    if (visitedIds.has(node.id)) return context.get(node.id) ?? '';
    visitedIds.add(node.id);

    if (await this.callbacks.shouldCancel?.()) {
      throw new WorkflowCanceledError();
    }

    const nodeStart = Date.now();
    this.callbacks.onNodeStart?.(node.id);

    let output = '';
    let error: string | undefined;
    let status: NodeStatus = 'success';

    try {
      output = await this.runNode(node, context, apiKeys);
      context.set(node.id, output);
    } catch (err) {
      status = 'error';
      error = err instanceof Error ? err.message : String(err);
    }

    const duration = Date.now() - nodeStart;
    const entry: ExecutionLogEntry = {
      nodeId: node.id,
      nodeLabel: node.data.label,
      nodeType: node.data.nodeType,
      status,
      startedAt: nodeStart,
      completedAt: Date.now(),
      duration,
      output: status === 'success' ? output : undefined,
      error,
    };
    this.logs.push(entry);
    this.callbacks.onLog?.(entry);
    this.callbacks.onNodeEnd?.(node.id, status, output, error);

    if (status === 'error') throw new Error(error);

    // Follow outgoing edges
    return await this.followEdges(node.id, context, apiKeys, visitedIds, output);
  }

  private async followEdges(
    nodeId: string,
    context: ExecutionContext,
    apiKeys: Record<string, string>,
    visitedIds: Set<string>,
    currentOutput: string
  ): Promise<string> {
    const outgoing = this.edges.filter((e) => e.source === nodeId);
    if (outgoing.length === 0) return currentOutput;

    let lastOutput = currentOutput;
    for (const edge of outgoing) {
      const targetNode = this.nodes.get(edge.target);
      if (!targetNode) continue;
      // Skip edges that don't match condition branch (true/false handle)
      // The condition node already decided which handle to allow in context
      const allowedHandle = context.get(`branch:${nodeId}`);
      if (allowedHandle !== undefined && edge.sourceHandle !== allowedHandle) continue;

      lastOutput = await this.executeNode(targetNode, context, apiKeys, visitedIds);
    }
    return lastOutput;
  }

  // ── Per-node executors ───────────────────────────────────────────────────

  private async runNode(
    node: WorkflowNode,
    context: ExecutionContext,
    apiKeys: Record<string, string>
  ): Promise<string> {
    switch (node.data.nodeType) {
      case 'start':    return this.runStart(node, context);
      case 'llm':      return this.runLLM(node, context, apiKeys);
      case 'condition': return this.runCondition(node, context);
      case 'knowledgeBase': return this.runKnowledgeBase(node, context);
      case 'output':   return this.runOutput(node, context);
      case 'transform': return this.runTransform(node, context);
      case 'http':     return this.runHttp(node, context);
      case 'filter':   return this.runFilter(node, context);
      case 'code':     return this.runCode(node, context);
      case 'sendEmail': return this.runSendEmail(node, context);
      case 'integration': return this.runIntegration(node, context, apiKeys);
      default:
        return '';
    }
  }

  private runStart(node: WorkflowNode, context: ExecutionContext): string {
    const config = asStartConfig(node.data.config);
    const parts: string[] = [];
    for (const v of config.inputVariables ?? []) {
      const val = context.get(`var:${v.name}`) ?? v.defaultValue ?? '';
      parts.push(val);
    }
    return parts.join('\n');
  }

  private async runLLM(
    node: WorkflowNode,
    context: ExecutionContext,
    apiKeys: Record<string, string>
  ): Promise<string> {
    const config = asLLMConfig(node.data.config);
    const apiKey = apiKeys[config.provider];
    if (!apiKey) {
      throw new Error(`No API key configured for provider: ${config.provider}`);
    }

    // Resolve input: prefer the variable specified in config, then last node output
    let userInput = this.resolveInput(config.inputVariable, context, node.id);

    const provider = getProvider(config.provider);
    let fullResponse = '';

    await provider.chat(
      [
        ...(config.systemPrompt ? [{ role: 'system' as const, content: config.systemPrompt }] : []),
        { role: 'user' as const, content: userInput },
      ],
      config.model,
      (chunk) => { fullResponse += chunk; },
      { apiKey, temperature: config.temperature, maxTokens: config.maxTokens }
    );

    return fullResponse;
  }

  private runCondition(node: WorkflowNode, context: ExecutionContext): string {
    const config = asConditionConfig(node.data.config);
    const input = this.getLastOutput(context, node.id);

    const result = this.evaluateCondition(input, config.operator, config.value);
    // Store branch decision so followEdges can filter
    context.set(`branch:${node.id}`, result ? 'true' : 'false');

    return result ? 'true' : 'false';
  }

  private async runKnowledgeBase(node: WorkflowNode, context: ExecutionContext): Promise<string> {
    const config = asKBConfig(node.data.config);
    const query = this.interpolate(config.query, context).trim();
    if (!query) return '';

    if (this.deps.searchKnowledgeBase) {
      return await this.deps.searchKnowledgeBase(query, config.topK);
    }

    const res = await fetch('/api/memory/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, limit: config.topK }),
    });
    if (!res.ok) {
      let detail = '';
      try {
        const body = (await res.json()) as { error?: string };
        detail = body.error ? `: ${body.error}` : '';
      } catch {
        /* ignore parse failure */
      }
      throw new Error(`Knowledge Base search failed (HTTP ${res.status})${detail}`);
    }

    const data = (await res.json()) as { results: Array<{ content: string }>; count: number };
    if (!data.results?.length) {
      return `No relevant memories found for: ${query}`;
    }
    return data.results.map((r, i) => `${i + 1}. ${r.content}`).join('\n');
  }

  private runOutput(node: WorkflowNode, context: ExecutionContext): string {
    return this.getLastOutput(context, node.id);
  }

  private runTransform(node: WorkflowNode, context: ExecutionContext): string {
    const config = asTransformConfig(node.data.config);
    const input = this.getLastOutput(context, node.id);

    switch (config.operation) {
      case 'template':
        return this.interpolate(config.template ?? '{{input}}', context, input);
      case 'uppercase':
        return input.toUpperCase();
      case 'lowercase':
        return input.toLowerCase();
      case 'trim':
        return input.trim();
      case 'replace':
        return input.replaceAll(config.searchValue ?? '', config.replaceValue ?? '');
      case 'extract_json': {
        try {
          const parsed = JSON.parse(input);
          if (config.jsonPath) {
            const parts = config.jsonPath.split('.');
            let val: unknown = parsed;
            for (const part of parts) {
              val = (val as Record<string, unknown>)?.[part];
            }
            return val !== undefined ? String(val) : input;
          }
          return JSON.stringify(parsed, null, 2);
        } catch {
          return input;
        }
      }
      case 'combine': {
        const parts = Array.from(context.values()).filter(Boolean);
        return parts.join('\n\n');
      }
      default:
        return input;
    }
  }

  private async runHttp(node: WorkflowNode, context: ExecutionContext): Promise<string> {
    const config = asHttpConfig(node.data.config);
    const url = this.interpolate(config.url, context);
    const body = this.interpolate(config.body, context);

    const headers: Record<string, string> = {};
    for (const h of config.headers ?? []) {
      if (h.key) headers[h.key] = this.interpolate(h.value, context);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeout || 10000);

    try {
      const res = await fetch(url, {
        method: config.method,
        headers,
        body: config.method !== 'GET' && body ? body : undefined,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      return await res.text();
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }
  }

  private async runIntegration(
    node: WorkflowNode,
    context: ExecutionContext,
    _apiKeys: Record<string, string>
  ): Promise<string> {
    const config = asIntegrationConfig(node.data.config);

    if (!config.projectId || !config.actionId) {
      throw new Error('Integration node is missing projectId or actionId');
    }

    // Resolve parameter values from context
    const params: Record<string, unknown> = {};
    for (const mapping of config.parameterMapping ?? []) {
      if (!mapping.paramName) continue;
      const value = this.interpolate(mapping.varName, context);
      params[mapping.paramName] = value;
    }

    // userId comes from the workflow context if available
    const userId = context.get('var:user_id') ?? context.get('var:userId') ?? 'workflow';

    const supabase = this.deps.supabaseClient ?? (typeof window !== 'undefined' ? getSupabaseClient() : null);

    const result = await executeAction(
      supabase,
      config.projectId,
      config.actionId,
      params,
      userId
    );

    if (!result.success) {
      throw new Error(result.error ?? 'Integration action failed');
    }

    return JSON.stringify(result.data ?? { success: true });
  }

  /** Filter — pass the input through if the predicate holds; otherwise halt the branch. */
  private runFilter(node: WorkflowNode, context: ExecutionContext): string {
    const config = asFilterConfig(node.data.config);
    const input = this.getLastOutput(context, node.id);
    let pass: boolean;
    if (config.operator === 'is_empty') pass = input.trim() === '';
    else if (config.operator === 'is_not_empty') pass = input.trim() !== '';
    else pass = this.evaluateCondition(input, config.operator as ConditionNodeConfig['operator'], config.value);
    if (!pass) {
      // No outgoing edge has this sourceHandle, so followEdges halts the branch.
      context.set(`branch:${node.id}`, '__filtered__');
    }
    return input;
  }

  /** Code — run a JS snippet `(input) => …`; the returned value becomes the output. */
  private runCode(node: WorkflowNode, context: ExecutionContext): string {
    const config = asCodeConfig(node.data.config);
    const input = this.getLastOutput(context, node.id);
    try {
      // The author's own snippet (same trust level as the HTTP node). Kept simple
      // and synchronous; the returned value is coerced to a string.
      const fn = new Function('input', config.code);
      const result = fn(input);
      return result === undefined || result === null ? '' : String(result);
    } catch (err) {
      throw new Error(`Code node error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Send Email — server only (deps.sendEmail injected by the server runner). */
  private async runSendEmail(node: WorkflowNode, context: ExecutionContext): Promise<string> {
    const config = asSendEmailConfig(node.data.config);
    if (!this.deps.sendEmail) {
      throw new Error('Send Email is only available when the workflow runs on the server (connected mode).');
    }
    const to = this.interpolate(config.to, context).trim();
    const subject = this.interpolate(config.subject, context);
    const body = this.interpolate(config.body, context, this.getLastOutput(context, node.id));
    if (!to) throw new Error('Send Email: no recipient');
    await this.deps.sendEmail(to, subject, body);
    return `Email sent to ${to}`;
  }

  // ── Utilities ────────────────────────────────────────────────────────────

  private findStartNode(): WorkflowNode | undefined {
    return Array.from(this.nodes.values()).find((n) => n.data.nodeType === 'start');
  }

  /** Get the output of the node that feeds into this one (last edge source). */
  private getLastOutput(context: ExecutionContext, currentNodeId: string): string {
    const incomingEdge = this.edges.find((e) => e.target === currentNodeId);
    if (incomingEdge) {
      const sourceOutput = context.get(incomingEdge.source);
      if (sourceOutput !== undefined) return sourceOutput;
    }
    // Fallback: first variable
    const firstVar = Array.from(context.entries()).find(([k]) => k.startsWith('var:'));
    return firstVar?.[1] ?? '';
  }

  /** Resolve a named variable reference or fall back to last node output. */
  private resolveInput(
    variableName: string | undefined,
    context: ExecutionContext,
    currentNodeId: string
  ): string {
    if (variableName) {
      const varVal = context.get(`var:${variableName}`);
      if (varVal !== undefined) return varVal;
    }
    return this.getLastOutput(context, currentNodeId);
  }

  /** Replace {{varName}} placeholders using context. */
  private interpolate(
    template: string,
    context: ExecutionContext,
    inputFallback = ''
  ): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      if (key === 'input') return inputFallback;
      const varVal = context.get(`var:${key}`);
      if (varVal !== undefined) return varVal;
      // Search by exact key in context
      const directVal = context.get(key);
      if (directVal !== undefined) return directVal;
      return '';
    });
  }

  private evaluateCondition(
    input: string,
    operator: ConditionNodeConfig['operator'],
    value: string
  ): boolean {
    switch (operator) {
      case 'contains':     return input.toLowerCase().includes(value.toLowerCase());
      case 'not_contains': return !input.toLowerCase().includes(value.toLowerCase());
      case 'equals':       return input.trim() === value.trim();
      case 'not_equals':   return input.trim() !== value.trim();
      case 'starts_with':  return input.startsWith(value);
      case 'ends_with':    return input.endsWith(value);
      case 'greater_than': return Number(input) > Number(value);
      case 'less_than':    return Number(input) < Number(value);
      case 'regex': {
        try { return new RegExp(value).test(input); } catch { return false; }
      }
      default: return false;
    }
  }
}
