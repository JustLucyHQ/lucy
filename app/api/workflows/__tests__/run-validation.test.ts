// app/api/workflows/__tests__/run-validation.test.ts
import { validateRunBody } from '../run/validate';

describe('validateRunBody', () => {
  it('rejects a definition with no start node', () => {
    const r = validateRunBody({ definition: { name: 'x', nodes: [{ data: { nodeType: 'output' } }], edges: [] }, inputs: {} });
    expect(r.ok).toBe(false);
  });
  it('accepts a start node and KEEPS a valid (word/hyphen) workflowId', () => {
    const r = validateRunBody({
      workflowId: 'wf_ex_github-repo',
      definition: { name: 'x', nodes: [{ data: { nodeType: 'start' } }], edges: [] },
      inputs: { a: '1' },
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.workflowId).toBe('wf_ex_github-repo'); // localStorage/UUID id kept as-is (workflow_id is TEXT)
  });
  it('nulls a malformed workflowId', () => {
    const r = validateRunBody({
      workflowId: 'not a valid id!',
      definition: { name: 'x', nodes: [{ data: { nodeType: 'start' } }], edges: [] },
      inputs: {},
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.workflowId).toBeNull(); // spaces / '!' rejected → null
  });
});
