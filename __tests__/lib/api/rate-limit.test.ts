import { checkRateLimit, getClientIp } from '@/lib/api/rate-limit';

function fakeReq(headers: Record<string, string>): any {
  return { headers: { get: (k: string) => headers[k.toLowerCase()] ?? null } };
}

// Regression test: getClientIp() previously trusted the FIRST X-Forwarded-For
// entry, which nginx's `$proxy_add_x_forwarded_for` APPENDS to rather than
// replaces — so a client sending their own X-Forwarded-For header could plant
// an arbitrary IP in the first position and reset the rate-limit bucket key
// per request. It must trust X-Real-IP (nginx overwrites this unconditionally
// from $remote_addr) first, and fall back to the LAST X-Forwarded-For entry.
describe('getClientIp', () => {
  it('prefers X-Real-IP over X-Forwarded-For', () => {
    expect(getClientIp(fakeReq({ 'x-real-ip': '9.9.9.9', 'x-forwarded-for': '1.2.3.4' }))).toBe('9.9.9.9');
  });

  it('falls back to the LAST X-Forwarded-For entry, not the first, when X-Real-IP is absent', () => {
    expect(getClientIp(fakeReq({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }))).toBe('5.6.7.8');
  });

  it('is not fooled by a client prepending a fake IP onto X-Forwarded-For', () => {
    const attackerSupplied = '6.6.6.6';
    const nginxAppended = '203.0.113.7';
    expect(getClientIp(fakeReq({ 'x-forwarded-for': `${attackerSupplied}, ${nginxAppended}` }))).toBe(nginxAppended);
  });

  it('returns "unknown" when neither header is present', () => {
    expect(getClientIp(fakeReq({}))).toBe('unknown');
  });
});

describe('checkRateLimit', () => {
  it('allows up to max requests then limits', () => {
    const ns = 'test-allow';
    for (let i = 0; i < 3; i++) {
      expect(checkRateLimit(ns, 'ip1', 3).limited).toBe(false);
    }
    const limited = checkRateLimit(ns, 'ip1', 3);
    expect(limited.limited).toBe(true);
    expect(limited.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('tracks IPs independently', () => {
    const ns = 'test-ips';
    expect(checkRateLimit(ns, 'a', 1).limited).toBe(false);
    expect(checkRateLimit(ns, 'a', 1).limited).toBe(true);
    expect(checkRateLimit(ns, 'b', 1).limited).toBe(false);
  });

  it('keeps namespaces separate', () => {
    expect(checkRateLimit('ns-x', 'same-ip', 1).limited).toBe(false);
    expect(checkRateLimit('ns-y', 'same-ip', 1).limited).toBe(false);
  });
});
