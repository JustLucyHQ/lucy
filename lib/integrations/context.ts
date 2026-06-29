/**
 * Context Builder
 *
 * Fetches relevant data from a registered project's Supabase tables and
 * formats it as a concise system-message section for the LLM so the AI
 * is aware of the user's live data in connected projects.
 *
 * When Supabase is not configured the builder returns a lightweight
 * schema-only summary so the AI still knows what data *could* exist.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getProject, getProjectActions } from './registry';
import type { TableDefinition } from './registry';

// ─── Public interface ─────────────────────────────────────────────────────

export interface ContextOptions {
  projectId: string;
  userId: string;
  /** Rough token budget — truncates data rows when exceeded. */
  maxTokens?: number;
  /** Subset of table names to include. Defaults to all tables. */
  tables?: string[];
}

/**
 * Builds a system-prompt section describing the user's data in the given
 * project. Returns an empty string when the project is not registered.
 */
export async function buildProjectContext(
  supabase: SupabaseClient | null,
  options: ContextOptions
): Promise<string> {
  const { projectId, userId, maxTokens = 2000, tables: tableFilter } = options;

  const project = getProject(projectId);
  if (!project) return '';

  const actions = getProjectActions(projectId);
  const actionNames = actions.map((a) => a.name).join(', ');

  // Filter tables to what was requested (default: all)
  const tableDefs = project.tables.filter(
    (t) => !tableFilter || tableFilter.includes(t.name)
  );

  const lines: string[] = [
    `You have access to the user's ${project.name} data.`,
    `${project.description}`,
    '',
  ];

  let tokenBudget = maxTokens;

  for (const table of tableDefs) {
    if (tokenBudget <= 0) break;

    // Skip tables the current user shouldn't see
    if (table.accessPolicy === 'admin') continue;

    const tableLines = await buildTableContext(supabase, table, project.supabaseSchema, userId);
    const tableText = tableLines.join('\n');
    const approxTokens = Math.ceil(tableText.length / 4);

    if (approxTokens <= tokenBudget) {
      lines.push(...tableLines);
      tokenBudget -= approxTokens;
    }
  }

  if (actionNames) {
    lines.push('');
    lines.push(`Available actions you can trigger: ${actionNames}`);
  }

  return lines.join('\n');
}

// ─── Private helpers ──────────────────────────────────────────────────────

async function buildTableContext(
  supabase: SupabaseClient | null,
  table: TableDefinition,
  defaultSchema: string | undefined,
  userId: string
): Promise<string[]> {
  const schema = table.schema ?? defaultSchema;
  const qualifiedName = schema ? `${schema}.${table.name}` : table.name;

  // When Supabase is unavailable, emit a schema-only description
  if (!supabase) {
    return [
      `- ${table.name}: ${table.description}`,
      `  Columns: ${table.columns.map((c) => `${c.name} (${c.type})`).join(', ')}`,
    ];
  }

  try {
    // Build a query scoped to the current user where possible
    let query = supabase.from(qualifiedName).select('*').limit(10);

    // For user-scoped tables try to filter by the authenticated user
    if (table.accessPolicy === 'user') {
      // Heuristic: many tables have a user_id or created_by column
      const hasUserId = table.columns.some((c) => c.name === 'user_id');
      const hasSenderId = table.columns.some((c) => c.name === 'sender_id');
      if (hasUserId) {
        query = query.eq('user_id', userId);
      } else if (hasSenderId) {
        query = query.eq('sender_id', userId);
      }
    }

    const { data, error } = await query;

    if (error || !data || data.length === 0) {
      return [`- ${table.name}: ${table.description} (no records found)`];
    }

    const summary = summariseRows(table, data);
    return [
      `- ${table.name}: ${table.description}`,
      `  ${summary}`,
    ];
  } catch {
    // Non-fatal — return schema description only
    return [`- ${table.name}: ${table.description}`];
  }
}

/**
 * Produces a short natural-language summary from raw rows, showing the most
 * informative columns rather than dumping raw JSON.
 */
function summariseRows(table: TableDefinition, rows: Record<string, unknown>[]): string {
  const count = rows.length;

  // Try to find a "name" or "description" column to include in the summary
  const labelCol = table.columns.find((c) =>
    ['name', 'title', 'display_name', 'description', 'content'].includes(c.name)
  );

  if (!labelCol) {
    return `${count} record${count !== 1 ? 's' : ''}`;
  }

  const labels = rows
    .map((r) => r[labelCol.name])
    .filter(Boolean)
    .slice(0, 5)
    .map((v) => String(v).slice(0, 60));

  if (labels.length === 0) {
    return `${count} record${count !== 1 ? 's' : ''}`;
  }

  const suffix = count > labels.length ? ` (and ${count - labels.length} more)` : '';
  return `${count} record${count !== 1 ? 's' : ''}: ${labels.join(', ')}${suffix}`;
}
