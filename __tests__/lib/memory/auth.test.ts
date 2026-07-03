// Regression test for HIGH-1: resolveMemoryAuth() must enforce 2FA (TOTP AAL2 or
// email-2FA) for accounts that have it enabled — previously a stolen AAL1 session
// cookie could call any /api/* route directly and fully bypass 2FA, since
// proxy.ts's 2FA gate explicitly excludes /api/*.
//
// Also covers the signup email-verification gate (added alongside the fix for a
// self-lock bug: 2fa/request and 2fa/verify used to call resolveMemoryAuth,
// which blocks whenever 2FA is "outstanding" — which is always true until those
// exact routes succeed. Both gates now live in resolveMemoryAuth, and the four
// routes whose job is to satisfy them (signup/request, signup/confirm,
// 2fa/request, 2fa/verify) use the ungated resolveSessionUserId instead).

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

import { resolveMemoryAuth, resolveSessionUserId } from '@/lib/memory/auth';
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

describe('resolveMemoryAuth — email-verification + 2FA enforcement', () => {
  const REAL_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...REAL_ENV, NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: SECRET };
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID, email: 'a@b.com' } } });
    mockGetAAL.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal1' } }); // no TOTP factor
    // Same user_profiles row shape backs BOTH the email-verification gate and the
    // 2FA gate (both query .from('user_profiles').select(...).eq(...).maybeSingle()).
    mockMaybeSingle.mockResolvedValue({ data: { email_verified: true, two_factor_email_enabled: false } });
  });

  afterEach(() => {
    process.env = REAL_ENV;
  });

  it('authenticates normally when the account is verified with no 2FA enabled', async () => {
    const auth = await resolveMemoryAuth(fakeReq());
    expect(auth.userId).toBe(USER_ID);
    expect(auth.emailVerificationRequired).toBeUndefined();
    expect(auth.twoFactorRequired).toBeUndefined();
  });

  it('blocks an unverified account', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { email_verified: false, two_factor_email_enabled: false } });
    const auth = await resolveMemoryAuth(fakeReq());
    expect(auth.userId).toBeNull();
    expect(auth.emailVerificationRequired).toBe(true);
  });

  it('blocks when the user_profiles row does not exist yet (right after signup)', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null });
    const auth = await resolveMemoryAuth(fakeReq());
    expect(auth.userId).toBeNull();
    expect(auth.emailVerificationRequired).toBe(true);
  });

  it('checks email verification BEFORE 2FA — an unverified account is blocked as unverified, not 2FA-required', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { email_verified: false, two_factor_email_enabled: true } });
    const auth = await resolveMemoryAuth(fakeReq());
    expect(auth.emailVerificationRequired).toBe(true);
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
    mockMaybeSingle.mockResolvedValue({ data: { email_verified: true, two_factor_email_enabled: true } });
    const auth = await resolveMemoryAuth(fakeReq());
    expect(auth.userId).toBeNull();
    expect(auth.twoFactorRequired).toBe(true);
  });

  it('allows an email-2FA-enabled account with a valid signed cookie', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { email_verified: true, two_factor_email_enabled: true } });
    const cookie = signTwofaCookie(USER_ID, SECRET);
    const auth = await resolveMemoryAuth(fakeReq(cookie));
    expect(auth.userId).toBe(USER_ID);
  });

  it('does not accept another user\'s valid cookie', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { email_verified: true, two_factor_email_enabled: true } });
    const cookie = signTwofaCookie('someone-else', SECRET);
    const auth = await resolveMemoryAuth(fakeReq(cookie));
    expect(auth.userId).toBeNull();
    expect(auth.twoFactorRequired).toBe(true);
  });
});

describe('resolveSessionUserId — ungated session resolution', () => {
  const REAL_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...REAL_ENV, NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: SECRET };
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID, email: 'a@b.com' } } });
  });

  afterEach(() => {
    process.env = REAL_ENV;
  });

  it('returns the session user even when email is unverified — this is what lets signup/request and signup/confirm work at all', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { email_verified: false, two_factor_email_enabled: false } });
    const auth = await resolveSessionUserId(fakeReq());
    expect(auth.userId).toBe(USER_ID);
    // Confirms the profile lookup (used by the gates) is never even consulted here.
    expect(mockMaybeSingle).not.toHaveBeenCalled();
  });

  it('returns the session user even when 2FA is outstanding — this is what lets 2fa/request and 2fa/verify work at all', async () => {
    mockGetAAL.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' } });
    const auth = await resolveSessionUserId(fakeReq());
    expect(auth.userId).toBe(USER_ID);
  });

  it('returns null when there is no session', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const auth = await resolveSessionUserId(fakeReq());
    expect(auth.userId).toBeNull();
  });
});
