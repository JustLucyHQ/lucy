// Regression test for HIGH-1: resolveMemoryAuth() must enforce 2FA (TOTP AAL2 or
// email-2FA) for accounts that have it enabled — previously a stolen AAL1 session
// cookie could call any /api/* route directly and fully bypass 2FA, since
// proxy.ts's 2FA gate explicitly excludes /api/*.

const mockGetUser = jest.fn();
const mockGetAAL = jest.fn();
const mockMaybeSingle = jest.fn();

jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn().mockImplementation(() => ({
    auth: {
      getUser: mockGetUser,
      mfa: { getAuthenticatorAssuranceLevel: mockGetAAL },
    },
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({ maybeSingle: mockMaybeSingle }),
      }),
    }),
  })),
}));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
jest.mock('@/lib/auth/api-keys', () => ({ validateApiKey: jest.fn().mockResolvedValue(null) }));

import { resolveMemoryAuth } from '@/lib/memory/auth';
import { signTwofaCookie } from '@/lib/auth/twofa-cookie';

const USER_ID = 'user-123';
const SECRET = 'test-service-role-secret';

function fakeReq(cookieValue?: string): any {
  return {
    cookies: {
      getAll: () => (cookieValue ? [{ name: 'lucy_2fa', value: cookieValue }] : []),
      get: (name: string) => (name === 'lucy_2fa' && cookieValue ? { value: cookieValue } : undefined),
    },
    headers: { get: () => null },
  };
}

describe('resolveMemoryAuth — 2FA enforcement', () => {
  const REAL_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...REAL_ENV, NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: SECRET };
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID, email: 'a@b.com' } } });
    mockGetAAL.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal1' } }); // no TOTP factor
    mockMaybeSingle.mockResolvedValue({ data: { two_factor_email_enabled: false } }); // no email-2FA
  });

  afterEach(() => {
    process.env = REAL_ENV;
  });

  it('authenticates normally when the account has no 2FA enabled', async () => {
    const auth = await resolveMemoryAuth(fakeReq());
    expect(auth.userId).toBe(USER_ID);
    expect(auth.twoFactorRequired).toBeUndefined();
  });

  it('blocks a TOTP-enabled account stuck at AAL1', async () => {
    mockGetAAL.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' } });
    const auth = await resolveMemoryAuth(fakeReq());
    expect(auth.userId).toBeNull();
    expect(auth.twoFactorRequired).toBe(true);
  });

  it('allows a TOTP-enabled account once at AAL2', async () => {
    mockGetAAL.mockResolvedValue({ data: { currentLevel: 'aal2', nextLevel: 'aal2' } });
    const auth = await resolveMemoryAuth(fakeReq());
    expect(auth.userId).toBe(USER_ID);
  });

  it('blocks an email-2FA-enabled account with no valid cookie', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { two_factor_email_enabled: true } });
    const auth = await resolveMemoryAuth(fakeReq());
    expect(auth.userId).toBeNull();
    expect(auth.twoFactorRequired).toBe(true);
  });

  it('allows an email-2FA-enabled account with a valid signed cookie', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { two_factor_email_enabled: true } });
    const cookie = signTwofaCookie(USER_ID, SECRET);
    const auth = await resolveMemoryAuth(fakeReq(cookie));
    expect(auth.userId).toBe(USER_ID);
  });

  it('does not accept another user\'s valid cookie', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { two_factor_email_enabled: true } });
    const cookie = signTwofaCookie('someone-else', SECRET);
    const auth = await resolveMemoryAuth(fakeReq(cookie));
    expect(auth.userId).toBeNull();
    expect(auth.twoFactorRequired).toBe(true);
  });
});
