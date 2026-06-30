// lib/mcp/standalone-runtime.ts
// Standalone (no-Supabase) MCP runtime. In connected mode the chat route loads +
// executes connector tools via Supabase (loader.ts / executeMcpTool). Standalone
// has no server DB, so the client passes its localStorage installs in the chat
// request body and we connect to them here using the bundled CATALOG + client.ts.
// Only config-based catalog connectors (stdio npm / http) are supported — OAuth +
// custom connectors need a backend and are filtered out of the standalone catalog.
import { connect } from './client';
import { CATALOG } from './catalog';
import type { LoadedTool } from './tool-format';

export interface StandaloneInstall {
  server_slug: string;
  config: Record<string, unknown>;
  enabled?: boolean;
  require_approval?: boolean;
}

function serverFor(slug: string) {
  return CATALOG.find((s) => s.slug === slug);
}

/** Connect to every install, list its tools (namespaced by slug), disconnect.
 *  A connector that fails to connect/list is silently skipped. */
export async function loadToolsStandalone(installs: StandaloneInstall[]): Promise<LoadedTool[]> {
  const out: LoadedTool[] = [];
  for (const inst of installs) {
    const server = serverFor(inst.server_slug);
    if (!server) continue;
    let conn;
    try {
      conn = await connect(server, (inst.config ?? {}) as Record<string, string>);
      const tools = await conn.listTools();
      for (const t of tools) {
        out.push({ slug: inst.server_slug, name: t.name, description: t.description, inputSchema: t.inputSchema });
      }
    } catch {
      /* skip a connector that fails to connect/list */
    } finally {
      if (conn) await conn.close().catch(() => {});
    }
  }
  return out;
}

/** Execute one tool call against a standalone install (connect → call → close). */
export async function executeStandaloneTool(
  installs: StandaloneInstall[],
  slug: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const inst = installs.find((i) => i.server_slug === slug);
  const server = inst ? serverFor(slug) : undefined;
  if (!inst || !server) throw new Error(`connector not installed: ${slug}`);
  const conn = await connect(server, (inst.config ?? {}) as Record<string, string>);
  try {
    return await conn.callTool(toolName, args);
  } finally {
    await conn.close().catch(() => {});
  }
}
