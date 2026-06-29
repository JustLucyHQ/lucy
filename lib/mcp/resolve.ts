// lib/mcp/resolve.ts
// Connect to a connector for a user, choosing the right path:
//   1) OAuth-connected  → hosted remote MCP over http + Bearer token (or, for a
//      connector with no hosted MCP, the stdio package with the token injected);
//   2) pasted install   → the connector's stdio package (or its http URL).
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CatalogServer } from './types';
import { getInstallations, decodeConfig } from './installer';
import { getServer } from './registry';
import { getCustom, connectCustom } from './custom';
import { getAccessToken } from '@/lib/oauth/connections';
import { hasNative, nativeConn } from './native';
import { connect, type McpConn } from './client';

const isUrl = (s?: string | null): boolean => !!s && /^https?:\/\//i.test(s);

export async function connectForUser(
  svc: SupabaseClient<any, any, any>,
  userId: string,
  server: CatalogServer,
  installs?: any[],
): Promise<McpConn | null> {
  // 1) OAuth connection (the connection's provider == the connector slug).
  if (server.meta?.oauth) {
    const token = await getAccessToken(userId, server.slug);
    if (token) {
      const remote = server.meta.oauth.remoteMcpUrl;
      if (remote) {
        return connect({ ...server, transport: 'http' }, {}, { url: remote, bearerToken: token });
      }
      // No hosted remote MCP — prefer a native (REST-backed) tool provider when we
      // have one (Google/Microsoft/Slack); it refreshes the token per call.
      if (hasNative(server.slug)) {
        return nativeConn(userId, server.slug);
      }
      // Otherwise inject the token into the stdio package's secret field.
      const keyField = (server.config_schema ?? []).find((f) => f.type === 'secret');
      if (server.install_ref && keyField) {
        return connect({ ...server, transport: 'stdio' }, { [keyField.key]: token });
      }
      return null;
    }
  }

  // 2) Pasted installation.
  const list = installs ?? (await getInstallations(svc, userId));
  const inst = list.find((i: any) => i.server_slug === server.slug && i.enabled);
  if (inst) {
    const cfg = decodeConfig(server.config_schema ?? [], (inst.config ?? {}) as Record<string, unknown>);
    const transport = isUrl(server.install_ref) ? 'http' : 'stdio';
    return connect({ ...server, transport }, cfg);
  }

  return null;
}

/**
 * Resolve + connect any connector by slug for a user — a catalog connector
 * (via connectForUser) or one of the user's custom remote MCPs. Null if unknown.
 */
export async function connectAny(
  svc: SupabaseClient<any, any, any>,
  userId: string,
  slug: string,
  installs?: any[],
): Promise<McpConn | null> {
  const server = (await getServer(svc, slug)) as CatalogServer | null;
  if (server) {
    if (server.built_in) return null;
    return connectForUser(svc, userId, server, installs);
  }
  const custom = await getCustom(userId, slug);
  return custom ? connectCustom(custom) : null;
}
