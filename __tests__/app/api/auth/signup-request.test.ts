/**
 * @jest-environment node
 */
// The confirm page used to send a fresh code every time it opened (twice in dev), and confirm accepted only the
// newest — so the code in the inbox was "invalid". The request route now sends only when no valid code is out,
// and "Resend" has a cooldown. No real e-mail: the sender is mocked.
const createCode = jest.fn(async () => '123456');
const newestOpenCode = jest.fn();
const sendTemplateEmail = jest.fn(async () => true);
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn(() => ({})) }));
jest.mock('@/lib/memory/auth', () => ({ resolveSessionUserId: jest.fn() }));
jest.mock('@/lib/email/codes', () => ({ createCode: (...a: unknown[]) => createCode(...(a as [])), newestOpenCode: (...a: unknown[]) => newestOpenCode(...a), CODE_TTL_MINUTES: 15 }));
jest.mock('@/lib/email/send', () => ({ sendTemplateEmail: (...a: unknown[]) => sendTemplateEmail(...(a as [])) }));

import { POST } from '@/app/api/auth/signup/request/route';
import { resolveSessionUserId } from '@/lib/memory/auth';

let user = 0;
const req = (body?: unknown): any => ({ json: async () => body ?? {} });
const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();
const inMinutes = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

describe('auth/signup/request', () => {
  const REAL_ENV = process.env;
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...REAL_ENV, NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'svc' };
    (resolveSessionUserId as jest.Mock).mockResolvedValue({ userId: `user-${++user}`, email: 'ana@x.hr' });
  });
  afterEach(() => { process.env = REAL_ENV; });

  it('sends a code when none is out, and says where it went', async () => {
    newestOpenCode.mockResolvedValue(null);
    expect(await (await POST(req())).json()).toEqual({ ok: true, sent: true, email: 'ana@x.hr' });
    expect(sendTemplateEmail).toHaveBeenCalledTimes(1);
  });

  it('opening the page again does not send another while a code is valid', async () => {
    newestOpenCode.mockResolvedValue({ created_at: iso(120_000), expires_at: inMinutes(10) });
    expect(await (await POST(req())).json()).toEqual({ ok: true, sent: false, email: 'ana@x.hr' });
    expect(createCode).not.toHaveBeenCalled();
  });

  it('Resend waits 30 s after the last code, then sends', async () => {
    newestOpenCode.mockResolvedValue({ created_at: iso(10_000), expires_at: inMinutes(14) });
    const early = await (await POST(req({ resend: true }))).json();
    expect(early).toMatchObject({ ok: true, sent: false, retryInSec: 20 });
    newestOpenCode.mockResolvedValue({ created_at: iso(40_000), expires_at: inMinutes(14) });
    expect(await (await POST(req({ resend: true }))).json()).toMatchObject({ ok: true, sent: true });
  });

  it('two calls at the same moment send one code', async () => {
    newestOpenCode.mockResolvedValue(null);
    (resolveSessionUserId as jest.Mock).mockResolvedValue({ userId: 'same-user', email: 'ana@x.hr' });
    const [a, b] = await Promise.all([POST(req()), POST(req())]);
    const sent = [await a.json(), await b.json()].filter((j) => j.sent);
    expect(sent).toHaveLength(1);
    expect(sendTemplateEmail).toHaveBeenCalledTimes(1);
  });
});
