// lib/workflow/__tests__/cron.test.ts
import { isValidCron, nextRunAfter } from '../cron';

describe('cron', () => {
  it('validates expressions', () => {
    expect(isValidCron('0 9 * * *')).toBe(true);
    expect(isValidCron('totally not cron')).toBe(false);
  });

  it('computes the next run strictly after the given date', () => {
    const after = new Date('2026-01-01T08:00:00.000Z');
    const next = nextRunAfter('0 9 * * *', after, 'UTC');
    expect(next?.toISOString()).toBe('2026-01-01T09:00:00.000Z');
  });

  it('returns null for an invalid expression', () => {
    expect(nextRunAfter('nope', new Date('2026-01-01T00:00:00Z'))).toBeNull();
  });
});
