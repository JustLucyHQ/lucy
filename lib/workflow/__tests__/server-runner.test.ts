// lib/workflow/__tests__/server-runner.test.ts

// ── Mock heavy dependencies (same convention as engine-deps.test.ts) so the
//    real Anthropic/OpenAI SDKs are not imported under jsdom (TextEncoder is
//    unavailable there). ──────────────────────────────────────────────────────
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

jest.mock('openai', () => jest.fn().mockImplementation(() => ({})));

import { executeRun, type WorkflowRunRow } from '../server-runner';
import type { Workflow } from '../types';

// Minimal fake of the chained supabase client used by executeRun.
// `cancelRequested` drives the cancel-check read (workflow_runs.cancel_requested).
function fakeClient(updates: Record<string, unknown>[], cancelRequested = false) {
  return {
    from(table: string) {
      return {
        select() { return this; },
        eq() { return this; },
        // cancel-check read (workflow_runs.cancel_requested)
        async single() { return { data: { cancel_requested: cancelRequested }, error: null }; },
        // provider_configs read → no keys
        then(resolve: (v: { data: unknown[] }) => void) { resolve({ data: [] }); },
        update(patch: Record<string, unknown>) {
          updates.push({ table, ...patch });
          return { eq: async () => ({ error: null }) };
        },
      };
    },
  } as never;
}

function twoNodeWorkflow(): Workflow {
  return {
    id: 'w', name: 'two', description: '', isPublished: false, createdAt: 0, updatedAt: 0,
    nodes: [
      { id: 'start', type: 'start', position: { x: 0, y: 0 }, data: { nodeType: 'start', label: 'Start',
        config: { inputVariables: [{ name: 'user_query', description: '', defaultValue: '' }] } } },
      { id: 'out', type: 'output', position: { x: 0, y: 0 }, data: { nodeType: 'output', label: 'Output',
        config: { displayName: 'Result', format: 'text' } } },
    ],
    edges: [{ id: 'e', source: 'start', target: 'out' }],
  };
}

// No Start node → engine.execute returns { status: 'error' } deterministically
// (no provider/network), which exercises the fail/retry path.
function failingWorkflow(): Workflow {
  return {
    id: 'w', name: 'fail', description: '', isPublished: false, createdAt: 0, updatedAt: 0,
    nodes: [
      { id: 'out', type: 'output', position: { x: 0, y: 0 }, data: { nodeType: 'output', label: 'Output',
        config: { displayName: 'Result', format: 'text' } } },
    ],
    edges: [],
  };
}

describe('executeRun', () => {
  it('persists succeeded + outputs for a passing workflow', async () => {
    const updates: Record<string, unknown>[] = [];
    const run: WorkflowRunRow = { id: 'r1', user_id: 'u1', definition: twoNodeWorkflow(), inputs: { user_query: 'hi' } };
    await executeRun(run, fakeClient(updates));
    const final = updates[updates.length - 1];
    expect(final.status).toBe('succeeded');
    expect((final.outputs as { finalOutput: string }).finalOutput).toContain('hi');
    expect(final.completed_at).toBeTruthy();
  });

  it('persists canceled (NOT failed) when cancel_requested is true', async () => {
    const updates: Record<string, unknown>[] = [];
    const run: WorkflowRunRow = { id: 'r2', user_id: 'u1', definition: twoNodeWorkflow(), inputs: { user_query: 'hi' } };
    await executeRun(run, fakeClient(updates, /* cancelRequested */ true));
    const statuses = updates.map((u) => u.status).filter(Boolean);
    const final = updates[updates.length - 1];
    expect(final.status).toBe('canceled');
    expect(statuses).not.toContain('failed');
    expect(final.error).toBeNull();
    expect(final.completed_at).toBeTruthy();
  });

  it('requeues with a backoff (not failed) when attempts remain', async () => {
    const updates: Record<string, unknown>[] = [];
    const run: WorkflowRunRow = { id: 'r3', user_id: 'u1', definition: failingWorkflow(), inputs: {}, attempt: 1, max_attempts: 3 };
    await executeRun(run, fakeClient(updates));
    const final = updates[updates.length - 1];
    expect(final.status).toBe('queued');
    expect(final.next_attempt_at).toBeTruthy();
    expect(final.completed_at).toBeUndefined();
  });

  it('marks failed when no attempts remain', async () => {
    const updates: Record<string, unknown>[] = [];
    const run: WorkflowRunRow = { id: 'r4', user_id: 'u1', definition: failingWorkflow(), inputs: {}, attempt: 1, max_attempts: 1 };
    await executeRun(run, fakeClient(updates));
    const final = updates[updates.length - 1];
    expect(final.status).toBe('failed');
    expect(final.completed_at).toBeTruthy();
  });
});
