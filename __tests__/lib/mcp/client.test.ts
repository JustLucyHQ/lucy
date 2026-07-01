// Regression test for the CRITICAL fix: a spawned stdio MCP child must never
// inherit the app's own secrets (service-role key, provider keys, etc.) via a
// wholesale process.env spread — only an explicit minimal allowlist + the
// user's own connector config.

let capturedStdioOpts: { command: string; args: string[]; env: Record<string, string> } | null = null;

jest.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    listTools: jest.fn().mockResolvedValue({ tools: [] }),
    callTool: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
  })),
}));
jest.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: jest.fn().mockImplementation((opts) => {
    capturedStdioOpts = opts;
    return { opts };
  }),
}));
jest.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: jest.fn().mockImplementation(() => ({})),
}));

import { connect } from '@/lib/mcp/client';
import type { CatalogServer } from '@/lib/mcp/types';

const STDIO_SERVER: CatalogServer = {
  slug: 'demo-stdio',
  name: 'Demo',
  description: 'd',
  category: 'dev',
  transport: 'stdio',
  install_ref: '@demo/mcp-server',
  config_schema: [],
  tools: [],
};

describe('lib/mcp/client connect() — spawn env isolation', () => {
  const REAL_ENV = process.env;

  beforeEach(() => {
    capturedStdioOpts = null;
    process.env = {
      ...REAL_ENV,
      PATH: '/usr/bin:/bin',
      SUPABASE_SERVICE_ROLE_KEY: 'super-secret-service-role-key',
      OPENAI_API_KEY: 'sk-should-not-leak',
      SUPABASE_INTERNAL_URL: 'http://10.10.10.254:8000',
    };
  });

  afterEach(() => {
    process.env = REAL_ENV;
  });

  it('never passes the app secrets into the spawned child env', async () => {
    await connect(STDIO_SERVER, {});
    expect(capturedStdioOpts).not.toBeNull();
    expect(capturedStdioOpts!.env.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
    expect(capturedStdioOpts!.env.OPENAI_API_KEY).toBeUndefined();
    expect(capturedStdioOpts!.env.SUPABASE_INTERNAL_URL).toBeUndefined();
  });

  it('still passes PATH so npx can resolve', async () => {
    await connect(STDIO_SERVER, {});
    expect(capturedStdioOpts!.env.PATH).toBe('/usr/bin:/bin');
  });

  it('passes the user-supplied connector config through', async () => {
    await connect(STDIO_SERVER, { API_TOKEN: 'user-provided-token' });
    expect(capturedStdioOpts!.env.API_TOKEN).toBe('user-provided-token');
  });

  it('spawns via npx -y for an npm-style install_ref', async () => {
    await connect(STDIO_SERVER, {});
    expect(capturedStdioOpts!.command).toBe('npx');
    expect(capturedStdioOpts!.args).toEqual(['-y', '@demo/mcp-server']);
  });
});
