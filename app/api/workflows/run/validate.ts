// app/api/workflows/run/validate.ts
// Workflow ids may be Supabase UUIDs OR localStorage ids (e.g. "wf_ex_github-repo"),
// so accept any short word/hyphen id — runs store it as-is (workflow_id is TEXT).
const WORKFLOW_ID_RE = /^[\w-]{1,64}$/;

interface DefNode { data?: { nodeType?: string } }
export interface ValidRun {
  ok: true;
  name: string;
  definition: { name: string; nodes: DefNode[]; edges: unknown[] };
  inputs: Record<string, string>;
  workflowId: string | null;
}
export type ValidateResult = ValidRun | { ok: false; status: number; error: string };

export function validateRunBody(body: unknown): ValidateResult {
  const b = body as { workflowId?: unknown; definition?: { name?: unknown; nodes?: unknown; edges?: unknown }; inputs?: unknown } | null;
  const def = b?.definition;
  if (!def || !Array.isArray(def.nodes)) return { ok: false, status: 400, error: 'Missing workflow definition' };
  if (def.nodes.length > 500) return { ok: false, status: 413, error: 'Workflow too large' };
  const hasStart = (def.nodes as DefNode[]).some((n) => n?.data?.nodeType === 'start');
  if (!hasStart) return { ok: false, status: 400, error: 'Workflow needs a Start node' };
  const workflowId = typeof b?.workflowId === 'string' && WORKFLOW_ID_RE.test(b.workflowId) ? b.workflowId : null;
  const inputs = (b?.inputs && typeof b.inputs === 'object' ? b.inputs : {}) as Record<string, string>;
  return {
    ok: true,
    name: typeof def.name === 'string' ? def.name : 'Workflow',
    definition: { name: typeof def.name === 'string' ? def.name : 'Workflow', nodes: def.nodes as DefNode[], edges: Array.isArray(def.edges) ? def.edges : [] },
    inputs,
    workflowId,
  };
}
