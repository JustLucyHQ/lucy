import { WorkflowEngine } from '../engine';
import type { Workflow } from '../types';

jest.mock('@/lib/providers', () => ({ getProvider: () => ({ chat: async () => {} }), getModelsByProvider: () => ({}) }));
jest.mock('@/lib/integrations/actions', () => ({ executeAction: async () => ({ success: true }) }));
jest.mock('@/lib/supabase/client', () => ({ getSupabaseClient: () => null }));

const start = { id: 'start', type: 'start', position: { x: 0, y: 0 }, data: { nodeType: 'start', label: 'Start', config: { inputVariables: [{ name: 'user_query', description: '', defaultValue: '' }] } } };
const out = { id: 'out', type: 'output', position: { x: 0, y: 0 }, data: { nodeType: 'output', label: 'Out', config: { displayName: 'R', format: 'text' } } };

function wf(middle: unknown, extraEdges: unknown[] = []): Workflow {
  return {
    id: 'w', name: 'n', description: '', isPublished: false, createdAt: 0, updatedAt: 0,
    nodes: [start, middle, out] as never,
    edges: [{ id: 'e1', source: 'start', target: 'mid' }, { id: 'e2', source: 'mid', target: 'out' }, ...extraEdges] as never,
  };
}

describe('new workflow nodes', () => {
  const codeNode = (code: string) => ({ id: 'mid', type: 'code', position: { x: 0, y: 0 }, data: { nodeType: 'code', label: 'Code', config: { code } } });

  it('Code node runs the snippet and returns its value (server runner opts in)', async () => {
    const r = await new WorkflowEngine(wf(codeNode('return input.toUpperCase();')), {}, { allowCodeExecution: true }).execute({ user_query: 'hi' }, {});
    expect(r.status).toBe('completed');
    expect(r.finalOutput).toBe('HI');
  });

  // The browser path builds `new WorkflowEngine(def, callbacks)` with no deps: user code must never execute there.
  it('Code node NEVER executes without the server opt-in (browser default)', async () => {
    (globalThis as { __codeRan?: boolean }).__codeRan = false;
    const r = await new WorkflowEngine(wf(codeNode('globalThis.__codeRan = true; return "pwned";'))).execute({ user_query: 'hi' }, {});
    expect(r.status).toBe('error');
    expect(r.error).toMatch(/Code steps run only on the server/);
    expect((globalThis as { __codeRan?: boolean }).__codeRan).toBe(false);
    expect(r.logs.some((l) => l.nodeId === 'out')).toBe(false); // downstream did not run
  });

  it('Code node is refused on a multi-tenant server even with the opt-in', async () => {
    const prev = process.env.WORKFLOW_MULTI_TENANT;
    process.env.WORKFLOW_MULTI_TENANT = '1';
    try {
      const r = await new WorkflowEngine(wf(codeNode('return "x";')), {}, { allowCodeExecution: true }).execute({ user_query: 'hi' }, {});
      expect(r.status).toBe('error');
      expect(r.error).toMatch(/multi-tenant/);
    } finally {
      if (prev === undefined) delete process.env.WORKFLOW_MULTI_TENANT; else process.env.WORKFLOW_MULTI_TENANT = prev;
    }
  });

  it('Filter passes the branch when the predicate holds', async () => {
    const mid = { id: 'mid', type: 'filter', position: { x: 0, y: 0 }, data: { nodeType: 'filter', label: 'Filter', config: { operator: 'is_not_empty', value: '' } } };
    const r = await new WorkflowEngine(wf(mid)).execute({ user_query: 'hi' }, {});
    expect(r.status).toBe('completed');
    expect(r.logs.some((l) => l.nodeId === 'out')).toBe(true); // downstream ran
  });

  it('Filter halts the branch when the predicate fails', async () => {
    const mid = { id: 'mid', type: 'filter', position: { x: 0, y: 0 }, data: { nodeType: 'filter', label: 'Filter', config: { operator: 'is_empty', value: '' } } };
    const r = await new WorkflowEngine(wf(mid)).execute({ user_query: 'hi' }, {});
    expect(r.status).toBe('completed');
    expect(r.logs.some((l) => l.nodeId === 'out')).toBe(false); // downstream did NOT run
  });

  it('Send Email uses the injected sendEmail dep with interpolated fields', async () => {
    const calls: Array<[string, string, string]> = [];
    const mid = { id: 'mid', type: 'sendEmail', position: { x: 0, y: 0 }, data: { nodeType: 'sendEmail', label: 'Email', config: { to: 'a@b.com', subject: 'Hi', body: '{{input}}' } } };
    const engine = new WorkflowEngine(wf(mid), {}, { sendEmail: async (to, subject, body) => { calls.push([to, subject, body]); } });
    const r = await engine.execute({ user_query: 'hello' }, {});
    expect(r.status).toBe('completed');
    expect(calls).toEqual([['a@b.com', 'Hi', 'hello']]);
  });

  it('Send Email errors without the dep (browser path)', async () => {
    const mid = { id: 'mid', type: 'sendEmail', position: { x: 0, y: 0 }, data: { nodeType: 'sendEmail', label: 'Email', config: { to: 'a@b.com', subject: 'Hi', body: 'x' } } };
    const r = await new WorkflowEngine(wf(mid)).execute({ user_query: 'hello' }, {});
    expect(r.status).toBe('error');
    expect(r.error).toMatch(/server/i);
  });
});
