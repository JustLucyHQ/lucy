import { checkRateLimit } from '@/lib/api/rate-limit';

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
