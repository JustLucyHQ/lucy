/**
 * Action Executor
 *
 * Runs actions that are defined in a registered ProjectIntegration.
 * Supports four handler types:
 *   - supabase-insert  – INSERT a row into a Supabase table
 *   - supabase-update  – UPDATE a matching row in a Supabase table
 *   - api-call         – POST to an external HTTP endpoint
 *   - workflow         – Trigger a Lucy workflow by ID (placeholder)
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getProject } from './registry';

// ─── Public interface ─────────────────────────────────────────────────────

export interface ActionResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * Executes a named action on a registered integration.
 *
 * @param supabase  - Supabase client (may be null if Supabase is not configured)
 * @param projectId - Integration id (e.g. 'contractors-room')
 * @param actionId  - Action id within that integration (e.g. 'create-project')
 * @param params    - Key/value parameters for the action
 * @param userId    - The authenticated user's id, injected into inserts as needed
 */
export async function executeAction(
  supabase: SupabaseClient | null,
  projectId: string,
  actionId: string,
  params: Record<string, unknown>,
  userId: string
): Promise<ActionResult> {
  const project = getProject(projectId);
  if (!project) {
    return { success: false, error: `Integration '${projectId}' is not registered` };
  }

  const action = project.actions.find((a) => a.id === actionId);
  if (!action) {
    return {
      success: false,
      error: `Action '${actionId}' not found in integration '${projectId}'`,
    };
  }

  // Validate required parameters
  for (const param of action.parameters) {
    if (param.required && (params[param.name] === undefined || params[param.name] === null)) {
      return {
        success: false,
        error: `Missing required parameter: ${param.name}`,
      };
    }
  }

  switch (action.handler) {
    case 'supabase-insert':
      return handleSupabaseInsert(supabase, action.config, params, userId);
    case 'supabase-update':
      return handleSupabaseUpdate(supabase, action.config, params);
    case 'api-call':
      return handleApiCall(action.config, params);
    case 'workflow':
      return handleWorkflow(action.config, params);
    default:
      return { success: false, error: `Unknown handler type: ${(action as { handler: string }).handler}` };
  }
}

// ─── Handler implementations ──────────────────────────────────────────────

async function handleSupabaseInsert(
  supabase: SupabaseClient | null,
  config: Record<string, unknown>,
  params: Record<string, unknown>,
  userId: string
): Promise<ActionResult> {
  if (!supabase) {
    return { success: false, error: 'Supabase is not configured' };
  }

  const { table, schema } = config as { table: string; schema?: string };
  if (!table) return { success: false, error: 'Action config is missing a table name' };

  const qualifiedTable = schema ? `${schema}.${table}` : table;

  // Automatically inject sender_id / user_id when present in params keys
  const row: Record<string, unknown> = { ...params };
  if (!row.sender_id && !row.user_id) {
    // Try to infer from common column names — non-fatal if neither exists
    row.sender_id = userId;
  }

  const { data, error } = await supabase.from(qualifiedTable).insert([row]).select();

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, data: data?.[0] };
}

async function handleSupabaseUpdate(
  supabase: SupabaseClient | null,
  config: Record<string, unknown>,
  params: Record<string, unknown>
): Promise<ActionResult> {
  if (!supabase) {
    return { success: false, error: 'Supabase is not configured' };
  }

  const { table, schema, matchColumn } = config as {
    table: string;
    schema?: string;
    matchColumn: string;
  };

  if (!table || !matchColumn) {
    return { success: false, error: 'Action config is missing table or matchColumn' };
  }

  const matchValue = params[matchColumn];
  if (matchValue === undefined) {
    return { success: false, error: `Missing match column value: ${matchColumn}` };
  }

  const qualifiedTable = schema ? `${schema}.${table}` : table;

  // Build the update payload — exclude the match column itself
  const updatePayload = Object.fromEntries(
    Object.entries(params).filter(([k]) => k !== matchColumn)
  );

  const { data, error } = await supabase
    .from(qualifiedTable)
    .update(updatePayload)
    .eq(matchColumn, matchValue)
    .select();

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, data: data?.[0] };
}

async function handleApiCall(
  config: Record<string, unknown>,
  params: Record<string, unknown>
): Promise<ActionResult> {
  const { endpoint, method = 'POST' } = config as { endpoint: string; method?: string };

  if (!endpoint) {
    return { success: false, error: 'Action config is missing an endpoint URL' };
  }

  try {
    const response = await fetch(endpoint, {
      method: String(method),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
    }

    const data = await response.json().catch(() => null);
    return { success: true, data };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Network error',
    };
  }
}

async function handleWorkflow(
  config: Record<string, unknown>,
  params: Record<string, unknown>
): Promise<ActionResult> {
  // Placeholder — real implementation would POST to /api/workflows/[id]/run
  const { workflowId } = config as { workflowId?: string };

  if (!workflowId) {
    return { success: false, error: 'Action config is missing a workflowId' };
  }

  try {
    const response = await fetch(`/api/workflows/${workflowId}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      return { success: false, error: `Workflow trigger failed: HTTP ${response.status}` };
    }

    const data = await response.json().catch(() => null);
    return { success: true, data };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to trigger workflow',
    };
  }
}
