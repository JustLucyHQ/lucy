import {
  signTwofaCookie,
  verifyTwofaCookie,
  TWOFA_COOKIE_TTL_SECONDS,
} from '@/lib/auth/twofa-cookie';

const SECRET = 'test-secret-key';
const USER = '8c8f57c3-2f1e-4f6a-9d2b-1a2b3c4d5e6f';

describe('twofa-cookie', () => {
  it('round-trips a signed cookie for the same user', () => {
    const cookie = signTwofaCookie(USER, SECRET);
    expect(verifyTwofaCookie(cookie, USER, SECRET)).toBe(true);
  });

  it('rejects a cookie signed for a different user', () => {
    const cookie = signTwofaCookie(USER, SECRET);
    expect(verifyTwofaCookie(cookie, 'other-user-id', SECRET)).toBe(false);
  });

  it('rejects a cookie signed with a different secret', () => {
    const cookie = signTwofaCookie(USER, 'wrong-secret');
    expect(verifyTwofaCookie(cookie, USER, SECRET)).toBe(false);
  });

  it('rejects an expired cookie', () => {
    const past = Date.now() - (TWOFA_COOKIE_TTL_SECONDS + 60) * 1000;
    const cookie = signTwofaCookie(USER, SECRET, past);
    expect(verifyTwofaCookie(cookie, USER, SECRET)).toBe(false);
  });

  it('accepts a cookie just before expiry', () => {
    const cookie = signTwofaCookie(USER, SECRET);
    const justBeforeExpiry = Date.now() + (TWOFA_COOKIE_TTL_SECONDS - 60) * 1000;
    expect(verifyTwofaCookie(cookie, USER, SECRET, justBeforeExpiry)).toBe(true);
  });

  it('rejects a tampered payload', () => {
    const cookie = signTwofaCookie(USER, SECRET);
    const [, exp, sig] = cookie.split('.');
    const forged = `${USER}.${Number(exp) + 9999}.${sig}`;
    expect(verifyTwofaCookie(forged, USER, SECRET)).toBe(false);
  });

  it('rejects malformed values', () => {
    expect(verifyTwofaCookie(undefined, USER, SECRET)).toBe(false);
    expect(verifyTwofaCookie('', USER, SECRET)).toBe(false);
    expect(verifyTwofaCookie('a.b', USER, SECRET)).toBe(false);
    expect(verifyTwofaCookie('a.b.c.d', USER, SECRET)).toBe(false);
  });
});
