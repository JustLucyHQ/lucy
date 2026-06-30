jest.mock('@/lib/mcp/client', () => ({ connect: jest.fn() }));

import { connect } from '@/lib/mcp/client';
import { CATALOG } from '@/lib/mcp/catalog';
import { loadToolsStandalone, executeStandaloneTool } from '@/lib/mcp/standalone-runtime';

const mockConnect = connect as jest.MockedFunction<typeof connect>;
// A real catalog slug so serverFor() resolves (logic test — connect is mocked).
const slug = CATALOG.find((s) => !s.built_in)!.slug;

function makeConn() {
  return {
    listTools: jest.fn().mockResolvedValue([{ name: 'echo', description: 'd', inputSchema: { type: 'object' } }]),
    callTool: jest.fn().mockResolvedValue({ ok: true }),
    close: jest.fn().mockResolvedValue(undefined),
  };
}

describe('standalone MCP runtime', () => {
  let conn: ReturnType<typeof makeConn>;
  beforeEach(() => {
    conn = makeConn();
    mockConnect.mockReset();
    mockConnect.mockResolvedValue(conn as unknown as Awaited<ReturnType<typeof connect>>);
  });

  it('loadToolsStandalone connects, namespaces tools by slug, and closes', async () => {
    const tools = await loadToolsStandalone([{ server_slug: slug, config: { apiKey: 'x' }, enabled: true }]);
    expect(mockConnect).toHaveBeenCalledTimes(1);
    // config is forwarded to connect()
    expect(mockConnect.mock.calls[0][1]).toMatchObject({ apiKey: 'x' });
    expect(tools).toEqual([{ slug, name: 'echo', description: 'd', inputSchema: { type: 'object' } }]);
    expect(conn.close).toHaveBeenCalled();
  });

  it('loadToolsStandalone skips unknown slugs (no catalog entry)', async () => {
    const tools = await loadToolsStandalone([{ server_slug: '__does_not_exist__', config: {}, enabled: true }]);
    expect(mockConnect).not.toHaveBeenCalled();
    expect(tools).toEqual([]);
  });

  it('loadToolsStandalone skips a connector that fails to connect', async () => {
    mockConnect.mockRejectedValueOnce(new Error('spawn failed'));
    const tools = await loadToolsStandalone([{ server_slug: slug, config: {}, enabled: true }]);
    expect(tools).toEqual([]);
  });

  it('executeStandaloneTool connects, calls the tool, and closes', async () => {
    const result = await executeStandaloneTool([{ server_slug: slug, config: {}, enabled: true }], slug, 'echo', { a: 1 });
    expect(conn.callTool).toHaveBeenCalledWith('echo', { a: 1 });
    expect(result).toEqual({ ok: true });
    expect(conn.close).toHaveBeenCalled();
  });

  it('executeStandaloneTool throws when the connector is not installed', async () => {
    await expect(executeStandaloneTool([], slug, 'echo', {})).rejects.toThrow(/not installed/);
    expect(mockConnect).not.toHaveBeenCalled();
  });
});
