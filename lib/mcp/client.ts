// lib/mcp/client.ts
// Import paths verified against @modelcontextprotocol/sdk@1.29.0 exports map:
//   ./client        → dist/esm/client/index.js  (Client class)
//   ./client/stdio.js → dist/esm/client/stdio.js  (StdioClientTransport)
//   ./client/streamableHttp.js → dist/esm/client/streamableHttp.js (StreamableHTTPClientTransport)
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { CatalogServer } from './types';

export interface McpConn {
  listTools(): Promise<{ name: string; description?: string; inputSchema?: unknown }[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
  close(): Promise<void>;
}

export interface ConnectOpts {
  /** Override the URL for http transport (e.g. a hosted remote MCP endpoint). */
  url?: string;
  /** Bearer token to send on every request (OAuth-connected http transport). */
  bearerToken?: string;
}

// A spawned stdio MCP child must NOT inherit the app's own secrets (the
// service-role key, provider keys, etc. would otherwise sit in the env of
// arbitrary third-party npm code run via `npx -y <pkg>`). Only pass through
// what's actually needed to resolve/run node & npx cross-platform; the user's
// own connector config is layered on top and always wins.
const SPAWN_ENV_ALLOWLIST = [
  'PATH', 'HOME', 'USERPROFILE', 'TMPDIR', 'TEMP', 'TMP',
  'SystemRoot', 'windir', 'APPDATA', 'LOCALAPPDATA', 'COMSPEC', 'PATHEXT',
  'HOMEDRIVE', 'HOMEPATH', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE',
  'LANG', 'LC_ALL', 'NODE_PATH',
];
function minimalSpawnEnv(config: Record<string, string>): Record<string, string> {
  const base: Record<string, string> = {};
  for (const key of SPAWN_ENV_ALLOWLIST) {
    const v = process.env[key];
    if (v !== undefined) base[key] = v;
  }
  return { ...base, ...config };
}

export async function connect(
  server: CatalogServer,
  config: Record<string, string>,
  opts: ConnectOpts = {},
): Promise<McpConn> {
  const client = new Client({ name: 'lucy', version: '1.0.0' }, { capabilities: {} });
  let transport: StdioClientTransport | StreamableHTTPClientTransport;

  if (server.transport === 'stdio') {
    const ref = server.install_ref ?? '';
    // For npm packages (starting with @ or without spaces), run via npx -y
    const [cmd, ...args] =
      ref.startsWith('@') || !ref.includes(' ')
        ? ['npx', '-y', ref]
        : ref.split(' ');
    transport = new StdioClientTransport({
      command: cmd,
      args,
      env: minimalSpawnEnv(config),
    });
  } else {
    // http or sse transport — StreamableHTTPClientTransport handles both.
    // OAuth-connected connectors pass the hosted remote MCP URL + a bearer token.
    const url = new URL(opts.url ?? server.install_ref!);
    transport = new StreamableHTTPClientTransport(
      url,
      opts.bearerToken
        ? { requestInit: { headers: { Authorization: `Bearer ${opts.bearerToken}` } } }
        : undefined,
    );
  }

  await client.connect(transport);

  return {
    async listTools() {
      const r = await client.listTools();
      return (r.tools ?? []).map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      }));
    },
    async callTool(name: string, args: Record<string, unknown>) {
      // callTool signature: (params: { name, arguments }, resultSchema?, options?)
      return client.callTool({ name, arguments: args });
    },
    async close() {
      await client.close();
    },
  };
}
