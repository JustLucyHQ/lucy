// lib/workflow/__tests__/engine-cancel.test.ts
import { WorkflowEngine, WorkflowCanceledError } from '../engine';
import type { Workflow } from '../types';

jest.mock('@/lib/providers', () => ({ getProvider: () => ({ chat: async () => {} }), getModelsByProvider: () => ({}) }));
jest.mock('@/lib/integrations/actions', () => ({ executeAction: async () => ({ success: true }) }));
jest.mock('@/lib/supabase/client', () => ({ getSupabaseClient: () => null }));

function twoStep(): Workflow {
  return {
    id: 'w', name: 'c', description: '', isPublished: false, createdAt: 0, updatedAt: 0,
    nodes: [
      { id: 'start', type: 'start', position: { x: 0, y: 0 }, data: { nodeType: 'start', label: 'Start', config: { inputVariables: [{ name: 'user_query', description: '', defaultValue: '' }] } } },
      { id: 'out', type: 'output', position: { x: 0, y: 0 }, data: { nodeType: 'output', label: 'Out', config: { displayName: 'R', format: 'text' } } },
    ],
    edges: [{ id: 'e', source: 'start', target: 'out' }],
  };
}

describe('engine shouldCancel', () => {
  it('throws WorkflowCanceledError (does NOT swallow it as status:error) when shouldCancel returns true', async () => {
    const engine = new WorkflowEngine(twoStep(), { shouldCancel: () => true });
    // execute() must let the cancel escape so the caller can persist `canceled`,
    // not catch it and return { status: 'error' }.
    await expect(engine.execute({ user_query: 'x' }, {})).rejects.toBeInstanceOf(WorkflowCanceledError);
  });

  it('runs normally when shouldCancel is absent', async () => {
    const engine = new WorkflowEngine(twoStep(), {});
    const result = await engine.execute({ user_query: 'hi' }, {});
    expect(result.status).toBe('completed');
  });
});
