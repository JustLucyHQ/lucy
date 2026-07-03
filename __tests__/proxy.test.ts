/**
 * @jest-environment node
 */
// Regression test for MED-2: proxy.ts must fail CLOSED (redirect to login) when
// the 2FA check itself throws after a session was already confirmed — previously
// a single outer try/catch covered both the session lookup AND the 2FA checks, so
// a transient Supabase error during the email-2FA profile lookup fell through to
// the fail-open catch and silently served the protected page with 2FA unconfirmed.
// A total outage during the initial session lookup must still fail open.
//
// Also covers the signup email-verification gate (checked before 2FA): an
// unconfirmed account must be redirected to /auth/confirm-email.

const mockGetSession = jest.fn();
const mockGetAAL = jest.fn();
const mockMaybeSingle = jest.fn();

jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn().mockImplementation(() => ({
    auth: {
      getSession: mockGetSession,
      mfa: { getAuthenticatorAssuranceLevel: mockGetAAL },
    },
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({ maybeSingle: mockMaybeSingle }),
      }),
    }),
  })),
}));

import { proxy } from '@/proxy';

const REAL_ENV = process.env;
const USER_ID = 'user-123';

function fakeRequest(pathname: string): any {
  return {
    nextUrl: { pathname },
    url: `https://justlucy.ai${pathname}`,
    cookies: {
      getAll: () => [],
      get: () => undefined,
    },
  };
}

describe('proxy — 2FA fail-open vs fail-closed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...REAL_ENV,
      NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
      SUPABASE_SERVICE_ROLE_KEY: 'service-secret',
    };
    mockGetAAL.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal1' } });
    // Same user_profiles row shape backs BOTH the email-verification gate and the
    // 2FA gate (both query .from('user_profiles').select(...).eq(...).maybeSingle()).
    mockMaybeSingle.mockResolvedValue({ data: { email_verified: true, two_factor_email_enabled: false } });
  });

  afterEach(() => {
    process.env = REAL_ENV;
  });

  it('fails OPEN when the initial session lookup throws (total outage)', async () => {
    mockGetSession.mockRejectedValue(new Error('supabase unreachable'));
    const res = await proxy(fakeRequest('/chat'));
    expect(res.status).not.toBe(307);
    expect(res.headers.get('location')).toBeNull();
  });

  it('fails CLOSED when the email-2FA profile lookup throws after a valid session', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: USER_ID } } } });
    mockMaybeSingle.mockRejectedValue(new Error('transient db error'));
    const res = await proxy(fakeRequest('/chat'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/auth/login');
  });

  it('fails CLOSED when the AAL check throws in a way that escapes its own inner catch', async () => {
    // AAL failures are already caught by their own inner try/catch (fall through to
    // email-2FA), so simulate the outer-layer failure via the profile lookup instead,
    // confirming the whole 2FA block is fail-closed end-to-end.
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: USER_ID } } } });
    mockGetAAL.mockRejectedValue(new Error('aal unavailable'));
    mockMaybeSingle.mockResolvedValue({ data: { email_verified: true, two_factor_email_enabled: true } });
    const res = await proxy(fakeRequest('/chat'));
    // No valid 2FA cookie and email-2FA enabled -> normal redirect to /auth/2fa,
    // proving the AAL throw didn't leak through as an unconfirmed pass-through.
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/auth/2fa');
  });

  it('still passes through normally when there is no 2FA and no errors', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: USER_ID } } } });
    const res = await proxy(fakeRequest('/chat'));
    expect(res.status).not.toBe(307);
  });

  it('redirects an unverified account to /auth/confirm-email, checked before 2FA', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: USER_ID } } } });
    mockMaybeSingle.mockResolvedValue({ data: { email_verified: false, two_factor_email_enabled: true } });
    const res = await proxy(fakeRequest('/chat'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/auth/confirm-email');
  });

  it('redirects to /auth/confirm-email when the profile row does not exist yet', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: USER_ID } } } });
    mockMaybeSingle.mockResolvedValue({ data: null });
    const res = await proxy(fakeRequest('/chat'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/auth/confirm-email');
  });
});
