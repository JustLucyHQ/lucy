// lib/workflow/__tests__/engine-deps.test.ts
import { WorkflowEngine } from '../engine';
import type { Workflow } from '../types';

// ── Mock heavy dependencies (same as engine.test.ts) so the real Anthropic SDK
//    is not imported under jsdom (TextEncoder is unavailable there). ──────────
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

function kbWorkflow(): Workflow {
  return {
    id: 'w1', name: 'kb', description: '', isPublished: false, createdAt: 0, updatedAt: 0,
    nodes: [
      { id: 'start', type: 'start', position: { x: 0, y: 0 }, data: { nodeType: 'start', label: 'Start',
        config: { inputVariables: [{ name: 'user_query', description: '', defaultValue: '' }] } } },
      { id: 'kb', type: 'knowledgeBase', position: { x: 0, y: 0 }, data: { nodeType: 'knowledgeBase', label: 'KB',
        config: { collectionName: '', query: '{{user_query}}', topK: 3 } } },
    ],
    edges: [{ id: 'e', source: 'start', target: 'kb' }],
  };
}

describe('WorkflowEngine EngineDeps', () => {
  it('uses injected searchKnowledgeBase instead of fetch', async () => {
    const calls: Array<[string, number]> = [];
    const engine = new WorkflowEngine(kbWorkflow(), {}, {
      searchKnowledgeBase: async (query, topK) => { calls.push([query, topK]); return 'INJECTED'; },
    });
    const result = await engine.execute({ user_query: 'hello' }, {});
    expect(calls).toEqual([['hello', 3]]);
    expect(result.status).toBe('completed');
    const kbLog = result.logs.find((l) => l.nodeId === 'kb');
    expect(kbLog?.output).toBe('INJECTED');
  });
});
