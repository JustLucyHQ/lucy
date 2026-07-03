/**
 * @jest-environment node
 */
// Regression test for LOW-2: mcp/installations' GET/POST/PATCH/DELETE handlers
// previously had zero rate limiting — confirm the shared limited() gate fires
// for all four verbs and returns 429 before any auth/DB work happens.

jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
jest.mock('@/lib/memory/auth', () => ({ resolveMemoryAuth: jest.fn() }));
jest.mock('@/lib/mcp/installer', () => ({
  getInstallations: jest.fn(),
  install: jest.fn(),
  uninstall: jest.fn(),
  patchInstall: jest.fn(),
  maskConfig: jest.fn(),
  validateConfig: jest.fn(),
}));
jest.mock('@/lib/mcp/registry', () => ({ getServer: jest.fn() }));

import { GET, POST, PATCH, DELETE } from '@/app/api/mcp/installations/route';
import { resolveMemoryAuth } from '@/lib/memory/auth';

function fakeReq(url = 'https://x.test/api/mcp/installations', headers: Record<string, string> = {}): any {
  return {
    url,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    json: async () => ({}),
  };
}

describe('mcp/installations — rate limiting', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (resolveMemoryAuth as jest.Mock).mockResolvedValue({ userId: null });
  });

  it('rate-limits GET before auth is even checked', async () => {
    for (let i = 0; i < 30; i++) await GET(fakeReq('https://x.test/api/mcp/installations', { 'x-real-ip': 'ip-a' }));
    const callsBeforeLimit = (resolveMemoryAuth as jest.Mock).mock.calls.length;
    const res: any = await GET(fakeReq('https://x.test/api/mcp/installations', { 'x-real-ip': 'ip-a' }));
    expect(res.status).toBe(429);
    // The 31st call is the one that gets limited — auth must not run for it.
    expect((resolveMemoryAuth as jest.Mock).mock.calls.length).toBe(callsBeforeLimit);
  });

  it('rate-limits POST independently of GET (shared bucket, same IP)', async () => {
    for (let i = 0; i < 30; i++) await GET(fakeReq('https://x.test/api/mcp/installations', { 'x-real-ip': 'ip-b' }));
    const res: any = await POST(fakeReq('https://x.test/api/mcp/installations', { 'x-real-ip': 'ip-b' }));
    expect(res.status).toBe(429);
  });

  it('rate-limits PATCH and DELETE too', async () => {
    for (let i = 0; i < 30; i++) await GET(fakeReq('https://x.test/api/mcp/installations', { 'x-real-ip': 'ip-c' }));
    const patchRes: any = await PATCH(fakeReq('https://x.test/api/mcp/installations', { 'x-real-ip': 'ip-c' }));
    const deleteRes: any = await DELETE(fakeReq('https://x.test/api/mcp/installations?slug=foo', { 'x-real-ip': 'ip-c' }));
    expect(patchRes.status).toBe(429);
    expect(deleteRes.status).toBe(429);
  });

  it('does not rate-limit a fresh IP', async () => {
    const res: any = await GET(fakeReq('https://x.test/api/mcp/installations', { 'x-real-ip': 'ip-fresh' }));
    expect(res.status).not.toBe(429);
  });
});
