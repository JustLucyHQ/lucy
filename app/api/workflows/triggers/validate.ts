// app/api/workflows/triggers/validate.ts
import { isValidCron } from '@/lib/workflow/cron';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Tables a record_event trigger may watch (must match lib/supabase/workflow_events.sql). */
export const WATCHED_TABLES = ['conversations', 'memories'] as const;
const VALID_OPS = ['INSERT', 'UPDATE', 'DELETE'];

interface DefNode { data?: { nodeType?: string } }
interface Def { name?: unknown; nodes?: unknown; edges?: unknown }

export interface ValidTrigger {
  ok: true;
  name: string;
  type: 'cron' | 'webhook' | 'record_event';
  settings: Record<string, unknown>;
  definition: { name: string; nodes: DefNode[]; edges: unknown[] };
  inputs: Record<string, string>;
  workflowId: string | null;
}
export type TriggerValidateResult = ValidTrigger | { ok: false; status: number; error: string };

export function validateTriggerBody(body: unknown): TriggerValidateResult {
  const b = body as { workflowId?: unknown; name?: unknown; type?: unknown; settings?: Record<string, unknown>; definition?: Def; inputs?: unknown } | null;
  const type = b?.type;
  if (type !== 'cron' && type !== 'webhook' && type !== 'record_event') {
    return { ok: false, status: 400, error: 'type must be cron, webhook, or record_event' };
  }

  const def = b?.definition;
  if (!def || !Array.isArray(def.nodes)) return { ok: false, status: 400, error: 'Missing definition' };
  if (def.nodes.length > 500) return { ok: false, status: 413, error: 'Workflow too large' };
  if (!(def.nodes as DefNode[]).some((n) => n?.data?.nodeType === 'start')) {
    return { ok: false, status: 400, error: 'Workflow needs a Start node' };
  }

  const settings = (b?.settings && typeof b.settings === 'object' ? b.settings : {}) as Record<string, unknown>;
  if (type === 'cron') {
    if (settings.run_once) {
      // One-time schedule: a single future instant instead of a recurring cron.
      const at = typeof settings.run_at === 'string' ? Date.parse(settings.run_at) : NaN;
      if (!Number.isFinite(at)) return { ok: false, status: 400, error: 'run_at must be a valid date/time' };
    } else {
      const expr = typeof settings.expr === 'string' ? settings.expr : '';
      if (!isValidCron(expr)) return { ok: false, status: 400, error: 'Invalid cron expression' };
    }
  }
  if (type === 'record_event') {
    const table = settings.table;
    if (typeof table !== 'string' || !(WATCHED_TABLES as readonly string[]).includes(table)) {
      return { ok: false, status: 400, error: `table must be one of: ${WATCHED_TABLES.join(', ')}` };
    }
    const events = settings.events;
    if (!Array.isArray(events) || events.length === 0 || !events.every((e) => VALID_OPS.includes(e as string))) {
      return { ok: false, status: 400, error: 'events must be a non-empty subset of INSERT, UPDATE, DELETE' };
    }
    // Optional change filter: { field, from?, to?, changed? } — fire only when the field changes.
    const when = settings.when;
    if (when !== undefined) {
      const w = when as { field?: unknown };
      if (typeof when !== 'object' || when === null || typeof w.field !== 'string' || !w.field.trim()) {
        return { ok: false, status: 400, error: 'when.field must be a non-empty string' };
      }
    }
  }

  return {
    ok: true,
    name: typeof b?.name === 'string' && b.name.trim() ? b.name.trim() : (typeof def.name === 'string' ? def.name : 'Trigger'),
    type,
    settings,
    definition: { name: typeof def.name === 'string' ? def.name : 'Workflow', nodes: def.nodes as DefNode[], edges: Array.isArray(def.edges) ? def.edges : [] },
    inputs: (b?.inputs && typeof b.inputs === 'object' ? b.inputs : {}) as Record<string, string>,
    workflowId: typeof b?.workflowId === 'string' && UUID_RE.test(b.workflowId) ? b.workflowId : null,
  };
}
