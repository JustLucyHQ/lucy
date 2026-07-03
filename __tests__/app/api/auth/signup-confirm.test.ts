/**
 * @jest-environment node
 */
// Regression test for the signup email-verification feature: confirming a valid
// code must mark user_profiles.email_verified = true (upserted, since the row
// may not exist yet), and the route must use resolveSessionUserId (not
// resolveMemoryAuth) since it's one of the routes whose job is to SATISFY the
// email-verification gate — it would never be reachable if it were itself
// blocked by that gate.

const upsertCall = jest.fn().mockResolvedValue({ error: null });
const FAKE_SVC = { from: jest.fn().mockReturnValue({ upsert: upsertCall }) };
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn(() => FAKE_SVC) }));
jest.mock('@/lib/memory/auth', () => ({ resolveSessionUserId: jest.fn() }));
jest.mock('@/lib/email/codes', () => ({ confirmCode: jest.fn() }));

import { POST } from '@/app/api/auth/signup/confirm/route';
import { resolveSessionUserId } from '@/lib/memory/auth';
import { confirmCode } from '@/lib/email/codes';

function fakeReq(): any {
  return { json: async () => ({ code: '000000' }) };
}

describe('auth/signup/confirm', () => {
  const REAL_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    upsertCall.mockResolvedValue({ error: null });
    process.env = { ...REAL_ENV, NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'svc' };
    (resolveSessionUserId as jest.Mock).mockResolvedValue({ userId: 'user-1', email: 'a@b.com' });
  });

  afterEach(() => {
    process.env = REAL_ENV;
  });

  it('marks the account verified (upsert) on a correct code', async () => {
    (confirmCode as jest.Mock).mockResolvedValue({ ok: true });
    const res: any = await POST(fakeReq());
    const body = await res.json();
    expect(body).toEqual({ ok: true });
    expect(upsertCall).toHaveBeenCalledWith(
      { user_id: 'user-1', email_verified: true },
      { onConflict: 'user_id' }
    );
  });

  it('does not touch user_profiles on a wrong code', async () => {
    (confirmCode as jest.Mock).mockResolvedValue({ ok: false, reason: 'mismatch' });
    const res: any = await POST(fakeReq());
    const body = await res.json();
    expect(body).toEqual({ ok: false, reason: 'mismatch' });
    expect(upsertCall).not.toHaveBeenCalled();
  });

  it('401s when there is no session at all', async () => {
    (resolveSessionUserId as jest.Mock).mockResolvedValue({ userId: null, email: null });
    const res: any = await POST(fakeReq());
    expect(res.status).toBe(401);
  });

  it('works even though the account is not yet verified — this route exists to fix that', async () => {
    // resolveSessionUserId is intentionally ungated: it returns userId even when
    // email_verified is false, unlike resolveMemoryAuth. Confirms the route can
    // never be self-locked by the gate it's meant to clear.
    (confirmCode as jest.Mock).mockResolvedValue({ ok: true });
    const res: any = await POST(fakeReq());
    expect(res.status).toBe(200);
  });
});
