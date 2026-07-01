// lib/mcp/types.ts
export type Transport = 'stdio' | 'http' | 'sse';
export type Category =
  | 'dev' | 'productivity' | 'messaging' | 'data' | 'payments'
  | 'search' | 'local' | 'builtin' | 'cloud' | 'crm';
export type AuthMethod = 'oauth_remote_mcp' | 'oauth_app' | 'api_key' | 'connection_string' | 'none';

export interface ConfigField { key: string; label: string; type: 'text' | 'secret'; required: boolean; help?: string; }
export interface ToolInfo { name: string; description: string; }

/** OAuth descriptor for a connector (used by the Connect flow + MCP client). */
export interface OAuthInfo {
  provider: string;          // registry key, e.g. 'github'
  remoteMcpUrl?: string;     // hosted remote MCP endpoint (bearer the user's token)
  authorizeUrl?: string;
  tokenUrl?: string;
  scopes?: string[];
  dcr?: boolean;             // provider supports Dynamic Client Registration (no app to register)
}

/** Connector-level setup help + auth descriptor — stored in mcp_servers.meta. */
export interface ConnectorMeta {
  authMethod: AuthMethod;
  docsUrl?: string;          // provider documentation
  getKeyUrl?: string;        // direct "create your key/token" page
  steps?: string[];          // 2-5 concise setup / connect steps
  oauth?: OAuthInfo;
}

export interface CatalogServer {
  slug: string; name: string; description: string; author?: string; category: Category;
  icon?: string; transport: Transport; install_ref?: string;
  config_schema: ConfigField[]; tools: ToolInfo[]; verified?: boolean; built_in?: boolean;
  /** Only shown to admins (e.g. customer-specific connectors like Contractors Room). */
  adminOnly?: boolean;
  meta?: ConnectorMeta;
}
export interface Installation {
  server_slug: string; config: Record<string, unknown>; enabled: boolean; require_approval: boolean;
}
