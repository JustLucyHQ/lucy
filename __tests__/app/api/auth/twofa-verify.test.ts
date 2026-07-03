/**
 * @jest-environment node
 */
// Regression test for LOW-2: auth/2fa/verify previously had zero rate limiting,
// letting a hijacked/compromised session brute-force the emailed 2FA code with
// unlimited attempts. Verifies the userId-keyed limit fires and that it's scoped
// per-user (a different user's attempts aren't blocked by another's).

const FAKE_SVC = { marker: 'svc-client' };
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn(() => FAKE_SVC) }));
jest.mock('@/lib/memory/auth', () => ({ resolveSessionUserId: jest.fn() }));
jest.mock('@/lib/email/codes', () => ({ confirmCode: jest.fn().mockResolvedValue({ ok: false, reason: 'mismatch' }) }));
jest.mock('@/lib/auth/twofa-cookie', () => ({
  TWOFA_COOKIE_NAME: 'lucy_2fa',
  TWOFA_COOKIE_TTL_SECONDS: 3600,
  getTwofaSecret: jest.fn().mockReturnValue('secret'),
  signTwofaCookie: jest.fn().mockReturnValue('signed'),
}));

import { POST } from '@/app/api/auth/2fa/verify/route';
import { resolveSessionUserId } from '@/lib/memory/auth';
import { confirmCode } from '@/lib/email/codes';

function fakeReq(): any {
  return { json: async () => ({ code: '000000' }) };
}

describe('auth/2fa/verify — rate limiting', () => {
  const REAL_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...REAL_ENV, NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'svc' };
  });

  afterEach(() => {
    process.env = REAL_ENV;
  });

  it('blocks after RATE_LIMIT_MAX attempts for the same user', async () => {
    (resolveSessionUserId as jest.Mock).mockResolvedValue({ userId: 'user-brute-1' });
    for (let i = 0; i < 10; i++) await POST(fakeReq());
    const callsBeforeLimit = (confirmCode as jest.Mock).mock.calls.length;
    const res: any = await POST(fakeReq());
    const body = await res.json();
    expect(body).toEqual({ ok: false, reason: 'mismatch' });
    // The 11th attempt must not even reach confirmCode.
    expect((confirmCode as jest.Mock).mock.calls.length).toBe(callsBeforeLimit);
  });

  it('scopes the limit per-user — a different user is unaffected', async () => {
    (resolveSessionUserId as jest.Mock).mockResolvedValue({ userId: 'user-brute-2' });
    for (let i = 0; i < 10; i++) await POST(fakeReq());

    (resolveSessionUserId as jest.Mock).mockResolvedValue({ userId: 'user-fresh' });
    await POST(fakeReq());
    expect(confirmCode).toHaveBeenCalledWith(FAKE_SVC, 'user-fresh', '000000', '2fa');
  });
});
