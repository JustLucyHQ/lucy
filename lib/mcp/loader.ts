// lib/mcp/loader.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { getInstallations } from './installer';
import { connectAny } from './resolve';
import { listConnections } from '@/lib/oauth/connections';
import { listCustom } from './custom';
import type { LoadedTool } from './tool-format';

/**
 * Connect to every connector the user has enabled — pasted installs, OAuth
 * "Connected" providers, AND custom remote MCPs — list its tools (namespaced by
 * slug), then disconnect. A connector that fails is silently skipped.
 */
export async function loadToolsForUser(
  svc: SupabaseClient<any, any, any>,
  userId: string,
): Promise<LoadedTool[]> {
  const installs = (await getInstallations(svc, userId)).filter((i: any) => i.enabled);
  const connected = await listConnections(userId);
  const customs = await listCustom(userId);

  const slugs = new Set<string>();
  for (const i of installs) slugs.add(i.server_slug as string);
  for (const p of connected) slugs.add(p);
  for (const c of customs) slugs.add(c.slug);

  const out: LoadedTool[] = [];

  for (const slug of Array.from(slugs)) {
    let conn;
    try {
      conn = await connectAny(svc, userId, slug, installs);
      if (!conn) continue;
      const tools = await conn.listTools();
      for (const t of tools) {
        out.push({ slug, name: t.name, description: t.description, inputSchema: t.inputSchema });
      }
    } catch {
      /* skip a connector that fails to connect/list */
    } finally {
      if (conn) await conn.close().catch(() => {});
    }
  }

  return out;
}
