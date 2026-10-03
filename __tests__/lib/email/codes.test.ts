// __tests__/lib/email/codes.test.ts
import { hashCode, checkCode, evaluateCode, evaluateRecent, MAX_ATTEMPTS, CODE_TTL_MINUTES } from '@/lib/email/codes';

describe('code hashing', () => {
  it('round-trips a code (different salt each time)', () => {
    const h1 = hashCode('123456');
    const h2 = hashCode('123456');
    expect(h1).not.toEqual(h2);             // per-code salt
    expect(checkCode('123456', h1)).toBe(true);
    expect(checkCode('000000', h1)).toBe(false);
  });
});

describe('evaluateCode', () => {
  const now = 1_000_000_000_000;
  const good = (over: Partial<any> = {}) => ({
    code_hash: hashCode('111222'), attempts: 0,
    expires_at: new Date(now + 60_000).toISOString(), consumed_at: null, ...over,
  });
  it('no_code when row missing or already consumed', () => {
    expect(evaluateCode(null, '111222', now)).toEqual({ ok: false, reason: 'no_code' });
    expect(evaluateCode(good({ consumed_at: new Date(now).toISOString() }), '111222', now)).toEqual({ ok: false, reason: 'no_code' });
  });
  it('expired when past expires_at', () => {
    expect(evaluateCode(good({ expires_at: new Date(now - 1).toISOString() }), '111222', now)).toEqual({ ok: false, reason: 'expired' });
  });
  it('too_many at the attempt cap', () => {
    expect(evaluateCode(good({ attempts: MAX_ATTEMPTS }), '111222', now)).toEqual({ ok: false, reason: 'too_many' });
  });
  it('mismatch on wrong code, ok on right code', () => {
    expect(evaluateCode(good(), '999999', now)).toEqual({ ok: false, reason: 'mismatch' });
    expect(evaluateCode(good(), '111222', now)).toEqual({ ok: true });
  });
  it('exposes the ported constants', () => {
    expect(MAX_ATTEMPTS).toBe(5);
    expect(CODE_TTL_MINUTES).toBe(15);
  });
});

describe('evaluateRecent — the code someone reads is not always the newest one', () => {
  const now = 1_000_000_000_000;
  const row = (code: string, over: Partial<any> = {}) => ({
    code_hash: hashCode(code), attempts: 0, expires_at: new Date(now + 60_000).toISOString(), consumed_at: null, ...over,
  });

  it('accepts an earlier code that is still open', () => {
    const rows = [row('333333'), row('222222'), row('111111')];
    expect(evaluateRecent(rows, '222222', now)).toEqual({ verdict: { ok: true }, matchIndex: 1 });
    expect(evaluateRecent(rows, '111111', now).verdict).toEqual({ ok: true });
  });

  it('only the newest few count, and an expired one never does', () => {
    const rows = [row('444444'), row('333333'), row('222222'), row('111111')];
    expect(evaluateRecent(rows, '111111', now).verdict).toEqual({ ok: false, reason: 'mismatch' });
    const expired = [row('222222'), row('111111', { expires_at: new Date(now - 1).toISOString() })];
    expect(evaluateRecent(expired, '111111', now).verdict).toEqual({ ok: false, reason: 'mismatch' });
  });

  it('reports the newest code’s state when nothing matches', () => {
    expect(evaluateRecent([], '111111', now).verdict).toEqual({ ok: false, reason: 'no_code' });
    expect(evaluateRecent([row('111111', { expires_at: new Date(now - 1).toISOString() })], '999999', now).verdict).toEqual({ ok: false, reason: 'expired' });
    expect(evaluateRecent([row('111111', { attempts: MAX_ATTEMPTS })], '111111', now).verdict).toEqual({ ok: false, reason: 'too_many' });
  });
});
