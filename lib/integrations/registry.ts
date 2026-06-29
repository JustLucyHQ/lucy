/**
 * Integration Registry
 *
 * External apps register themselves here so Lucy knows what data they have,
 * what tables it can query, and what actions it can trigger on their behalf.
 *
 * The registry is in-memory and populated at startup by each integration
 * calling `registerProject`. It is intentionally synchronous so it can be
 * used in both server and client contexts without async overhead.
 */

// ─── Column / Table / Action types ────────────────────────────────────────

export interface ColumnDef {
  name: string;
  type: string;
  description: string;
}

export interface TableDefinition {
  name: string;
  /** Human-readable description used to build AI context. */
  description: string;
  /** Optional Supabase schema prefix (overrides the integration-level schema). */
  schema?: string;
  columns: ColumnDef[];
  accessPolicy: 'user' | 'public' | 'admin';
}

export interface ActionParam {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date';
  required: boolean;
  description: string;
}

export interface ActionDefinition {
  id: string;
  name: string;
  description: string;
  parameters: ActionParam[];
  /** How the action is executed. */
  handler: 'supabase-insert' | 'supabase-update' | 'api-call' | 'workflow';
  /** Handler-specific configuration (table name, endpoint URL, etc.). */
  config: Record<string, unknown>;
}

// ─── Top-level integration ────────────────────────────────────────────────

export interface ProjectIntegration {
  id: string;
  name: string;
  description: string;
  /** Supabase schema to prefix all table queries with (e.g. 'contractors_room'). */
  supabaseSchema?: string;
  tables: TableDefinition[];
  actions: ActionDefinition[];
  /** API endpoint or function name to pull live context from. */
  contextProvider?: string;
  icon?: string;
  color?: string;
}

// ─── Registry store ───────────────────────────────────────────────────────

const registry = new Map<string, ProjectIntegration>();

/**
 * Register an integration so Lucy can discover it.
 * Calling this with the same `id` replaces the previous registration.
 */
export function registerProject(integration: ProjectIntegration): void {
  registry.set(integration.id, integration);
}

/** Returns the integration with the given id, or null if not found. */
export function getProject(id: string): ProjectIntegration | null {
  return registry.get(id) ?? null;
}

/** Returns all registered integrations. */
export function getAllProjects(): ProjectIntegration[] {
  return Array.from(registry.values());
}

/** Returns the table definitions for a project. */
export function getProjectTables(projectId: string): TableDefinition[] {
  return registry.get(projectId)?.tables ?? [];
}

/** Returns the action definitions for a project. */
export function getProjectActions(projectId: string): ActionDefinition[] {
  return registry.get(projectId)?.actions ?? [];
}
