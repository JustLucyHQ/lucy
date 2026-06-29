import { nextBackoffMs } from '../backoff';

describe('nextBackoffMs', () => {
  it('grows exponentially from a 10s base', () => {
    expect(nextBackoffMs(1)).toBe(10_000);
    expect(nextBackoffMs(2)).toBe(20_000);
    expect(nextBackoffMs(3)).toBe(40_000);
  });
  it('caps at 5 minutes', () => {
    expect(nextBackoffMs(20)).toBe(300_000);
  });
  it('treats attempt < 1 as the first backoff', () => {
    expect(nextBackoffMs(0)).toBe(10_000);
  });
});
