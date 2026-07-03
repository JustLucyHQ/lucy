/**
 * @jest-environment node
 */
// Regression test for MED-4: voice transcribe's caller-supplied baseUrl must be
// SSRF-guarded on the multi-tenant SaaS deployment (WORKFLOW_MULTI_TENANT=1), and
// the server's own OPENAI_API_KEY must never be relayed to a caller-supplied
// baseUrl — that key is only valid for the real OpenAI endpoint.

const mockCreate = jest.fn().mockResolvedValue({ text: 'hello world' });
let lastOpenAIConfig: any = null;

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation((config: any) => {
    lastOpenAIConfig = config;
    return { audio: { transcriptions: { create: mockCreate } } };
  }),
  toFile: jest.fn().mockResolvedValue('fake-file'),
}));

jest.mock('@/lib/memory/auth', () => ({ resolveMemoryAuth: jest.fn().mockResolvedValue({ userId: null }) }));

import { POST } from '@/app/api/voice/transcribe/route';

function fakeReq(fields: Record<string, any>, headers: Record<string, string> = {}): any {
  const fd = new Map(Object.entries(fields));
  return {
    formData: async () => ({ get: (k: string) => (fd.has(k) ? fd.get(k) : null) }),
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
  };
}

const AUDIO_FILE = { type: 'audio/webm' };

describe('POST /api/voice/transcribe — baseUrl SSRF guard + key-relay protection', () => {
  const REAL_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    lastOpenAIConfig = null;
    // No Supabase env vars -> standalone mode, auth check skipped.
    process.env = { ...REAL_ENV };
    delete process.env.SUPABASE_INTERNAL_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    process.env.OPENAI_API_KEY = 'server-secret-key';
  });

  afterEach(() => {
    process.env = REAL_ENV;
  });

  it('rejects a private baseUrl on the multi-tenant deployment', async () => {
    process.env.WORKFLOW_MULTI_TENANT = '1';
    const req = fakeReq({ file: AUDIO_FILE, provider: 'local', baseUrl: 'http://169.254.169.254/latest' });
    const res: any = await POST(req);
    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('allows a public baseUrl on the multi-tenant deployment, without relaying the server key', async () => {
    process.env.WORKFLOW_MULTI_TENANT = '1';
    const req = fakeReq({ file: AUDIO_FILE, provider: 'local', baseUrl: 'https://my-whisper.example.com/v1' });
    const res: any = await POST(req);
    expect(res.status).toBe(200);
    expect(mockCreate).toHaveBeenCalled();
    expect(lastOpenAIConfig.apiKey).toBe('not-required');
  });

  it('uses the caller-supplied key over the server key when baseUrl is overridden', async () => {
    process.env.WORKFLOW_MULTI_TENANT = '1';
    const req = fakeReq(
      { file: AUDIO_FILE, provider: 'local', baseUrl: 'https://my-whisper.example.com/v1' },
      { 'x-openai-key': 'callers-own-key' },
    );
    const res: any = await POST(req);
    expect(res.status).toBe(200);
    expect(lastOpenAIConfig.apiKey).toBe('callers-own-key');
  });

  it('allows a private baseUrl for a single-tenant self-host (no WORKFLOW_MULTI_TENANT)', async () => {
    delete process.env.WORKFLOW_MULTI_TENANT;
    const req = fakeReq({ file: AUDIO_FILE, provider: 'local', baseUrl: 'http://localhost:9000/v1' });
    const res: any = await POST(req);
    expect(res.status).toBe(200);
    expect(mockCreate).toHaveBeenCalled();
  });

  it('still falls back to the server OPENAI_API_KEY for the default (no baseUrl) OpenAI endpoint', async () => {
    process.env.WORKFLOW_MULTI_TENANT = '1';
    const req = fakeReq({ file: AUDIO_FILE, provider: 'openai' });
    const res: any = await POST(req);
    expect(res.status).toBe(200);
    expect(lastOpenAIConfig.apiKey).toBe('server-secret-key');
  });
});
