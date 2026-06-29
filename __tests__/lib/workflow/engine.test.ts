/**
 * Tests for lib/workflow/engine.ts (WorkflowEngine)
 *
 * Tests cover: Start→Output linear execution, edge following, condition
 * branching (true/false paths), and transform node text operations.
 *
 * LLM calls and Supabase are mocked so no real APIs are needed.
 */

import { WorkflowEngine } from '@/lib/workflow/engine';
import type { Workflow, WorkflowNode, WorkflowEdge } from '@/lib/workflow/types';

// ── Mock heavy dependencies ──────────────────────────────────────────────────

jest.mock('@/lib/providers', () => ({
  getProvider: jest.fn(),
  getModelsByProvider: jest.fn(() => ({})),
}));

jest.mock('@/lib/integrations/actions', () => ({
  executeAction: jest.fn(),
}));

jest.mock('@/lib/supabase/client', () => ({
  getSupabaseClient: jest.fn(() => null),
}));

// ── Workflow builder helpers ─────────────────────────────────────────────────

function makeNode(
  id: string,
  nodeType: WorkflowNode['data']['nodeType'],
  config: Record<string, unknown> = {},
  label = nodeType
): WorkflowNode {
  return {
    id,
    type: nodeType,
    position: { x: 0, y: 0 },
    data: {
      nodeType,
      label,
      config: config as never,
    },
  };
}

function makeEdge(id: string, source: string, target: string, sourceHandle?: string): WorkflowEdge {
  return { id, source, target, sourceHandle };
}

function makeWorkflow(nodes: WorkflowNode[], edges: WorkflowEdge[]): Workflow {
  return {
    id: 'wf-test',
    name: 'Test Workflow',
    description: '',
    nodes,
    edges,
    isPublished: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('WorkflowEngine', () => {
  describe('Knowledge Base node (semantic search)', () => {
    const realFetch = global.fetch;
    afterEach(() => { global.fetch = realFetch; });

    it('calls /api/memory/search and formats the results', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [{ content: 'User likes hiking' }, { content: 'Lives in Berlin' }],
          count: 2,
        }),
      });
      global.fetch = fetchMock as unknown as typeof fetch;

      const nodes = [
        makeNode('start-1', 'start', {
          inputVariables: [{ name: 'user_query', description: '', defaultValue: 'outdoor hobbies' }],
        }),
        makeNode('kb-1', 'knowledgeBase', { collectionName: 'memories', query: '{{user_query}}', topK: 5 }),
        makeNode('output-1', 'output', {}),
      ];
      const edges = [makeEdge('e1', 'start-1', 'kb-1'), makeEdge('e2', 'kb-1', 'output-1')];

      const engine = new WorkflowEngine(makeWorkflow(nodes, edges));
      const result = await engine.execute({ user_query: 'outdoor hobbies' }, {});

      expect(result.status).toBe('completed');
      expect(fetchMock).toHaveBeenCalledWith('/api/memory/search', expect.objectContaining({ method: 'POST' }));
      const sentBody = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
      expect(sentBody).toEqual({ query: 'outdoor hobbies', limit: 5 });
      expect(result.finalOutput).toBe('1. User likes hiking\n2. Lives in Berlin');
    });

    it('surfaces a node error when the search endpoint fails', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Not authenticated' }),
      }) as unknown as typeof fetch;

      const nodes = [
        makeNode('start-1', 'start', {
          inputVariables: [{ name: 'q', description: '', defaultValue: 'x' }],
        }),
        makeNode('kb-1', 'knowledgeBase', { collectionName: 'm', query: '{{q}}', topK: 3 }),
      ];
      const edges = [makeEdge('e1', 'start-1', 'kb-1')];

      const engine = new WorkflowEngine(makeWorkflow(nodes, edges));
      const result = await engine.execute({ q: 'x' }, {});

      expect(result.status).toBe('error');
      expect(result.error).toMatch(/Knowledge Base search failed.*401.*Not authenticated/i);
    });
  });

  describe('Start → Output (linear execution)', () => {
    it('executes a simple two-node workflow and returns the start output', async () => {
      const nodes = [
        makeNode('start-1', 'start', {
          inputVariables: [{ name: 'user_query', description: '', defaultValue: 'hello' }],
        }),
        makeNode('output-1', 'output', { displayName: 'Result', format: 'text' }),
      ];
      const edges = [makeEdge('e1', 'start-1', 'output-1')];

      const engine = new WorkflowEngine(makeWorkflow(nodes, edges));
      const result = await engine.execute({ user_query: 'hello' }, {});

      expect(result.status).toBe('completed');
      expect(result.finalOutput).toBe('hello');
    });

    it('returns error status when no Start node is present', async () => {
      const nodes = [
        makeNode('output-1', 'output', { displayName: 'Result', format: 'text' }),
      ];
      const engine = new WorkflowEngine(makeWorkflow(nodes, []));
      const result = await engine.execute({}, {});

      expect(result.status).toBe('error');
      expect(result.error).toMatch(/No Start node/i);
    });

    it('produces a log entry for each executed node', async () => {
      const nodes = [
        makeNode('start-1', 'start', {
          inputVariables: [{ name: 'q', description: '', defaultValue: 'test' }],
        }),
        makeNode('output-1', 'output', {}),
      ];
      const edges = [makeEdge('e1', 'start-1', 'output-1')];

      const engine = new WorkflowEngine(makeWorkflow(nodes, edges));
      const result = await engine.execute({ q: 'test' }, {});

      expect(result.logs).toHaveLength(2);
      expect(result.logs[0].nodeId).toBe('start-1');
      expect(result.logs[1].nodeId).toBe('output-1');
    });

    it('calls onNodeStart and onNodeEnd callbacks', async () => {
      const onNodeStart = jest.fn();
      const onNodeEnd = jest.fn();

      const nodes = [
        makeNode('start-1', 'start', {
          inputVariables: [],
        }),
        makeNode('output-1', 'output', {}),
      ];
      const edges = [makeEdge('e1', 'start-1', 'output-1')];

      const engine = new WorkflowEngine(makeWorkflow(nodes, edges), {
        onNodeStart,
        onNodeEnd,
      });
      await engine.execute({}, {});

      expect(onNodeStart).toHaveBeenCalledWith('start-1');
      expect(onNodeStart).toHaveBeenCalledWith('output-1');
      expect(onNodeEnd).toHaveBeenCalledTimes(2);
    });
  });

  describe('edge following', () => {
    it('follows multiple sequential edges correctly', async () => {
      // start → transform (uppercase) → output
      const nodes = [
        makeNode('start-1', 'start', {
          inputVariables: [{ name: 'text', description: '', defaultValue: '' }],
        }),
        makeNode('transform-1', 'transform', { operation: 'uppercase' }),
        makeNode('output-1', 'output', {}),
      ];
      const edges = [
        makeEdge('e1', 'start-1', 'transform-1'),
        makeEdge('e2', 'transform-1', 'output-1'),
      ];

      const engine = new WorkflowEngine(makeWorkflow(nodes, edges));
      const result = await engine.execute({ text: 'hello' }, {});

      expect(result.status).toBe('completed');
      expect(result.finalOutput).toBe('HELLO');
    });
  });

  describe('condition node branching', () => {
    it('follows the true branch when condition is met', async () => {
      // start → condition (contains "yes") → true path → output-true
      //                                    → false path → output-false
      const nodes = [
        makeNode('start-1', 'start', {
          inputVariables: [{ name: 'answer', description: '', defaultValue: '' }],
        }),
        makeNode('cond-1', 'condition', { operator: 'contains', value: 'yes' }),
        makeNode('transform-true', 'transform', {
          operation: 'template',
          template: 'Approved',
        }),
        makeNode('transform-false', 'transform', {
          operation: 'template',
          template: 'Denied',
        }),
        makeNode('output-1', 'output', {}),
      ];
      const edges = [
        makeEdge('e1', 'start-1', 'cond-1'),
        makeEdge('e2', 'cond-1', 'transform-true', 'true'),
        makeEdge('e3', 'cond-1', 'transform-false', 'false'),
        makeEdge('e4', 'transform-true', 'output-1'),
      ];

      const engine = new WorkflowEngine(makeWorkflow(nodes, edges));
      const result = await engine.execute({ answer: 'yes please' }, {});

      expect(result.status).toBe('completed');
      expect(result.finalOutput).toBe('Approved');
    });

    it('follows the false branch when condition is not met', async () => {
      const nodes = [
        makeNode('start-1', 'start', {
          inputVariables: [{ name: 'answer', description: '', defaultValue: '' }],
        }),
        makeNode('cond-1', 'condition', { operator: 'contains', value: 'yes' }),
        makeNode('transform-true', 'transform', {
          operation: 'template',
          template: 'Approved',
        }),
        makeNode('transform-false', 'transform', {
          operation: 'template',
          template: 'Denied',
        }),
        makeNode('output-1', 'output', {}),
      ];
      const edges = [
        makeEdge('e1', 'start-1', 'cond-1'),
        makeEdge('e2', 'cond-1', 'transform-true', 'true'),
        makeEdge('e3', 'cond-1', 'transform-false', 'false'),
        makeEdge('e4', 'transform-false', 'output-1'),
      ];

      const engine = new WorkflowEngine(makeWorkflow(nodes, edges));
      const result = await engine.execute({ answer: 'no thanks' }, {});

      expect(result.status).toBe('completed');
      expect(result.finalOutput).toBe('Denied');
    });
  });

  describe('transform node operations', () => {
    async function runTransform(
      operation: string,
      input: string,
      extraConfig: Record<string, unknown> = {}
    ): Promise<string> {
      const nodes = [
        makeNode('start-1', 'start', {
          inputVariables: [{ name: 'text', description: '', defaultValue: '' }],
        }),
        makeNode('transform-1', 'transform', { operation, ...extraConfig }),
        makeNode('output-1', 'output', {}),
      ];
      const edges = [
        makeEdge('e1', 'start-1', 'transform-1'),
        makeEdge('e2', 'transform-1', 'output-1'),
      ];
      const engine = new WorkflowEngine(makeWorkflow(nodes, edges));
      const result = await engine.execute({ text: input }, {});
      return result.finalOutput ?? '';
    }

    it('uppercase operation converts text to uppercase', async () => {
      const output = await runTransform('uppercase', 'hello world');
      expect(output).toBe('HELLO WORLD');
    });

    it('lowercase operation converts text to lowercase', async () => {
      const output = await runTransform('lowercase', 'HELLO WORLD');
      expect(output).toBe('hello world');
    });

    it('trim operation removes leading and trailing whitespace', async () => {
      const output = await runTransform('trim', '  hello  ');
      expect(output).toBe('hello');
    });

    it('replace operation substitutes text', async () => {
      const output = await runTransform('replace', 'foo bar foo', {
        searchValue: 'foo',
        replaceValue: 'baz',
      });
      expect(output).toBe('baz bar baz');
    });

    it('template operation interpolates {{input}}', async () => {
      const output = await runTransform('template', 'world', {
        template: 'Hello {{input}}!',
      });
      expect(output).toBe('Hello world!');
    });
  });
});
