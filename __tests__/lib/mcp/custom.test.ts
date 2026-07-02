// Regression test for CRIT-4: custom MCP connector registration/connection
// must reject private/internal hosts (previously had zero SSRF validation).

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn().mockReturnValue({
    from: jest.fn().mockReturnValue({
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { id: '1', slug: 'x', name: 'x', url: 'https://example.com', token_enc: null }, error: null }),
    }),
  }),
}));
jest.mock('@/lib/mcp/secret', () => ({
  encryptSecret: jest.fn((s: string) => `enc:${s}`),
  decryptSecret: jest.fn((s: string) => s.replace(/^enc:/, '')),
}));
jest.mock('@/lib/mcp/client', () => ({
  connect: jest.fn().mockResolvedValue({ listTools: jest.fn(), callTool: jest.fn(), close: jest.fn() }),
}));

import { createCustom, connectCustom } from '@/lib/mcp/custom';

describe('custom MCP connector — SSRF guard wiring', () => {
  it('createCustom rejects a private-host URL', async () => {
    await expect(createCustom('user1', 'Internal', 'http://10.10.10.254:8000')).rejects.toThrow(/private\/internal/);
  });

  it('createCustom rejects localhost', async () => {
    await expect(createCustom('user1', 'Local', 'http://localhost:11434')).rejects.toThrow(/private\/internal/);
  });

  it('createCustom allows a public URL', async () => {
    await expect(createCustom('user1', 'Public', 'https://example.com/mcp')).resolves.toBeDefined();
  });

  it('connectCustom re-checks at connection time and rejects a private host', async () => {
    await expect(
      connectCustom({ id: '1', slug: 'x', name: 'x', url: 'http://192.168.1.1', token_enc: null }),
    ).rejects.toThrow(/private\/internal/);
  });
});
